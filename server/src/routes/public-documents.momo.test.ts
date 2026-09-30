import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";
import { prisma } from "../lib/prisma.js";
import * as momoClientModule from "../lib/momo-client.js";
import * as generateReceiptModule from "../lib/generate-payment-receipt.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
  process.env.MOMO_CREDENTIALS_ENCRYPTION_KEY ??= Buffer.alloc(32, 3).toString("base64");
});

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
});

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

async function setUpMomoInvoice(app: ReturnType<typeof createApp>, amount = 10000) {
  const cookies = await registerAndGetCookies(app);
  await request(app).patch("/business/momo-settings").set("Cookie", cookies).send({
    enabled: true,
    environment: "sandbox",
    subscriptionKey: "sub-key",
    apiUser: "api-user",
    apiKey: "api-key",
  });

  const customer = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId: customer.body.customer.id,
      issueDate: "2026-09-01",
      lines: [{ description: "Cement", quantity: 1, unitPrice: amount, taxRate: 0 }],
    });
  await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);
  const finalized = await request(app).get(`/documents/${created.body.document.id}`).set("Cookie", cookies);
  return { document: finalized.body.document as { id: string; publicToken: string }, cookies };
}

describe("GET /public/documents/:token amountOwed", () => {
  it("reports the balance after payments and credit notes", async () => {
    const app = createApp();
    const { document, cookies } = await setUpMomoInvoice(app, 10000);

    const before = await request(app).get(`/public/documents/${document.publicToken}`);
    expect(before.body.document.amountOwed).toBe(10000);

    const invoice = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    const credit = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "CREDIT_NOTE",
        customerId: invoice.customerId,
        referencedDocumentId: document.id,
        issueDate: "2026-09-02",
        lines: [{ description: "Returned goods", quantity: 1, unitPrice: 4000, taxRate: 0 }],
      });
    await request(app).post(`/documents/${credit.body.document.id}/finalize`).set("Cookie", cookies);

    const after = await request(app).get(`/public/documents/${document.publicToken}`);
    expect(after.body.document.amountOwed).toBe(6000);
  });

  it("is zero once the invoice is fully paid", async () => {
    const app = createApp();
    const { document, cookies } = await setUpMomoInvoice(app, 10000);
    await request(app)
      .post(`/documents/${document.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 10000, method: "CASH", paidOn: "2026-09-03" });

    const res = await request(app).get(`/public/documents/${document.publicToken}`);

    expect(res.body.document.amountOwed).toBe(0);
  });
});

describe("GET /public/documents/:token payments", () => {
  it("lists recorded payments with a receipt token, and leaves voided ones out", async () => {
    const app = createApp();
    const { document, cookies } = await setUpMomoInvoice(app, 10000);
    const kept = await request(app)
      .post(`/documents/${document.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 3000, method: "CASH", paidOn: "2026-09-03", generateReceipt: true });
    const voided = await request(app)
      .post(`/documents/${document.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 2000, method: "CASH", paidOn: "2026-09-04" });
    await request(app)
      .post(`/documents/${document.id}/payments/${voided.body.payment.id}/void`)
      .set("Cookie", cookies)
      .send({ voidReason: "entered twice" });

    const res = await request(app).get(`/public/documents/${document.publicToken}`);

    expect(res.body.document.payments).toHaveLength(1);
    expect(res.body.document.payments[0]).toMatchObject({ id: kept.body.payment.id, amount: 3000, method: "CASH" });
    const receipt = await prisma.document.findUniqueOrThrow({ where: { id: kept.body.payment.receiptDocumentId } });
    expect(res.body.document.payments[0].receiptToken).toBe(receipt.publicToken);
  });

  it("gives a payment without a receipt a null token", async () => {
    const app = createApp();
    const { document, cookies } = await setUpMomoInvoice(app, 10000);
    await request(app)
      .post(`/documents/${document.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 3000, method: "CASH", paidOn: "2026-09-03" });

    const res = await request(app).get(`/public/documents/${document.publicToken}`);

    expect(res.body.document.payments[0].receiptToken).toBeNull();
  });
});

describe("POST /public/documents/:token/momo/request", () => {
  it("creates a payment request for the outstanding balance and calls MTN", async () => {
    const app = createApp();
    const { document } = await setUpMomoInvoice(app);
    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
    const requestToPaySpy = vi.spyOn(momoClientModule, "requestToPay").mockResolvedValue(undefined);

    const res = await request(app)
      .post(`/public/documents/${document.publicToken}/momo/request`)
      .send({ phoneNumber: "250788000000" });

    expect(res.status).toBe(201);
    expect(res.body.requestId).toBeTruthy();
    expect(requestToPaySpy).toHaveBeenCalledTimes(1);
    expect(requestToPaySpy).toHaveBeenCalledWith(
      expect.anything(),
      "token-123",
      expect.objectContaining({ currency: "EUR" }),
    );

    const stored = await prisma.momoPaymentRequest.findUniqueOrThrow({ where: { id: res.body.requestId } });
    expect(stored.status).toBe("PENDING");
    expect(stored.amount).toBe(10000);
  });

  it("normalizes a locally formatted phone number before sending it to MTN", async () => {
    const app = createApp();
    const { document } = await setUpMomoInvoice(app);
    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
    const requestToPaySpy = vi.spyOn(momoClientModule, "requestToPay").mockResolvedValue(undefined);

    const res = await request(app)
      .post(`/public/documents/${document.publicToken}/momo/request`)
      // How a customer would naturally type their own number, not MTN's MSISDN format.
      .send({ phoneNumber: "0788123456" });

    expect(requestToPaySpy).toHaveBeenCalledWith(
      expect.anything(),
      "token-123",
      expect.objectContaining({ phoneNumber: "250788123456" }),
    );
    const stored = await prisma.momoPaymentRequest.findUniqueOrThrow({ where: { id: res.body.requestId } });
    expect(stored.phoneNumber).toBe("250788123456");
  });

  it("returns the existing pending request instead of creating a second one", async () => {
    const app = createApp();
    const { document } = await setUpMomoInvoice(app);
    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
    const requestToPaySpy = vi.spyOn(momoClientModule, "requestToPay").mockResolvedValue(undefined);

    const first = await request(app)
      .post(`/public/documents/${document.publicToken}/momo/request`)
      .send({ phoneNumber: "250788000000" });
    const second = await request(app)
      .post(`/public/documents/${document.publicToken}/momo/request`)
      .send({ phoneNumber: "250788000000" });

    expect(second.body.requestId).toBe(first.body.requestId);
    expect(requestToPaySpy).toHaveBeenCalledTimes(1);
  });

  it("never creates two requests when two payment requests race each other", async () => {
    const app = createApp();
    const { document } = await setUpMomoInvoice(app);
    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
    const requestToPaySpy = vi.spyOn(momoClientModule, "requestToPay").mockResolvedValue(undefined);

    // Fired together, not one after another - the same double-click/retry scenario the
    // advisory lock in the route (see idempotent-payment.ts) exists to close.
    const [first, second] = await Promise.all([
      request(app).post(`/public/documents/${document.publicToken}/momo/request`).send({ phoneNumber: "250788000000" }),
      request(app).post(`/public/documents/${document.publicToken}/momo/request`).send({ phoneNumber: "250788000000" }),
    ]);

    expect(first.body.requestId).toBe(second.body.requestId);
    expect(requestToPaySpy).toHaveBeenCalledTimes(1);
    const requests = await prisma.momoPaymentRequest.findMany({ where: { documentId: document.id } });
    expect(requests).toHaveLength(1);
  });

  it("marks the request FAILED when the MTN call itself fails", async () => {
    const app = createApp();
    const { document } = await setUpMomoInvoice(app);
    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
    vi.spyOn(momoClientModule, "requestToPay").mockRejectedValue(new Error("insufficient funds"));

    const res = await request(app)
      .post(`/public/documents/${document.publicToken}/momo/request`)
      .send({ phoneNumber: "250788000000" });

    expect(res.status).toBe(502);
    const stored = await prisma.momoPaymentRequest.findFirstOrThrow({ where: { documentId: document.id } });
    expect(stored.status).toBe("FAILED");
  });

  it("returns 400 when the business hasn't enabled MoMo", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customer = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId: customer.body.customer.id,
        issueDate: "2026-09-01",
        lines: [{ description: "Cement", quantity: 1, unitPrice: 10000, taxRate: 0 }],
      });
    await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);
    const finalized = await request(app).get(`/documents/${created.body.document.id}`).set("Cookie", cookies);

    const res = await request(app)
      .post(`/public/documents/${finalized.body.document.publicToken}/momo/request`)
      .send({ phoneNumber: "250788000000" });

    expect(res.status).toBe(400);
  });
});

describe("GET /public/documents/:token/momo/request/:requestId", () => {
  async function createPendingRequest(app: ReturnType<typeof createApp>) {
    const { document, cookies } = await setUpMomoInvoice(app);
    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
    vi.spyOn(momoClientModule, "requestToPay").mockResolvedValue(undefined);
    const created = await request(app)
      .post(`/public/documents/${document.publicToken}/momo/request`)
      .send({ phoneNumber: "250788000000" });
    return { document, cookies, requestId: created.body.requestId as string };
  }

  it("returns PENDING while MTN hasn't resolved the request", async () => {
    const app = createApp();
    const { document, requestId } = await createPendingRequest(app);
    vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({ status: "PENDING" });

    const res = await request(app).get(`/public/documents/${document.publicToken}/momo/request/${requestId}`);

    expect(res.body).toEqual({ status: "PENDING" });
  });

  it("records the payment and marks the request SUCCESSFUL once MTN confirms it", async () => {
    const app = createApp();
    const { document, requestId } = await createPendingRequest(app);
    vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({ status: "SUCCESSFUL" });

    const res = await request(app).get(`/public/documents/${document.publicToken}/momo/request/${requestId}`);

    expect(res.body.status).toBe("SUCCESSFUL");
    const invoice = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(invoice.paymentStatus).toBe("PAID");
    const payment = await prisma.invoicePayment.findFirstOrThrow({ where: { documentId: document.id } });
    expect(payment.momoPaymentRequestId).toBe(requestId);
  });

  it("issues a finalized receipt for the MoMo payment", async () => {
    const app = createApp();
    const { document, requestId } = await createPendingRequest(app);
    vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({ status: "SUCCESSFUL" });

    await request(app).get(`/public/documents/${document.publicToken}/momo/request/${requestId}`);

    const payment = await prisma.invoicePayment.findFirstOrThrow({ where: { documentId: document.id } });
    expect(payment.receiptDocumentId).not.toBeNull();
    const receipt = await prisma.document.findUniqueOrThrow({ where: { id: payment.receiptDocumentId! } });
    expect(receipt).toMatchObject({ type: "RECEIPT", status: "FINALIZED", total: 10000, referencedDocumentId: document.id });
  });

  it("still records the payment when the receipt cannot be issued", async () => {
    const app = createApp();
    const { document, requestId } = await createPendingRequest(app);
    vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({ status: "SUCCESSFUL" });
    vi.spyOn(generateReceiptModule, "generatePaymentReceipt").mockRejectedValue(new Error("boom"));

    const res = await request(app).get(`/public/documents/${document.publicToken}/momo/request/${requestId}`);

    expect(res.body.status).toBe("SUCCESSFUL");
    const invoice = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(invoice.paymentStatus).toBe("PAID");
  });

  it("stores the failure reason and marks the request FAILED", async () => {
    const app = createApp();
    const { document, requestId } = await createPendingRequest(app);
    vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({ status: "FAILED", reason: "PAYER_NOT_FOUND" });

    const res = await request(app).get(`/public/documents/${document.publicToken}/momo/request/${requestId}`);

    expect(res.body).toEqual({ status: "FAILED", failureReason: "PAYER_NOT_FOUND" });
  });

  it("does not call MTN again once the request is already terminal", async () => {
    const app = createApp();
    const { document, requestId } = await createPendingRequest(app);
    const statusSpy = vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({ status: "SUCCESSFUL" });

    await request(app).get(`/public/documents/${document.publicToken}/momo/request/${requestId}`);
    await request(app).get(`/public/documents/${document.publicToken}/momo/request/${requestId}`);

    expect(statusSpy).toHaveBeenCalledTimes(1);
  });

  it("marks a stale pending request EXPIRED without calling MTN", async () => {
    const app = createApp();
    const { document, requestId } = await createPendingRequest(app);
    await prisma.momoPaymentRequest.update({
      where: { id: requestId },
      data: { createdAt: new Date(Date.now() - 6 * 60 * 1000) },
    });
    const statusSpy = vi.spyOn(momoClientModule, "getRequestToPayStatus");

    const res = await request(app).get(`/public/documents/${document.publicToken}/momo/request/${requestId}`);

    expect(res.body).toEqual({ status: "EXPIRED" });
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it("fails the request instead of double-recording when the balance was already paid down manually", async () => {
    const app = createApp();
    const { document, cookies, requestId } = await createPendingRequest(app);
    await request(app)
      .post(`/documents/${document.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 10000, method: "CASH", paidOn: "2026-09-01" });
    vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({ status: "SUCCESSFUL" });

    const res = await request(app).get(`/public/documents/${document.publicToken}/momo/request/${requestId}`);

    expect(res.body.status).toBe("FAILED");
    const payments = await prisma.invoicePayment.findMany({ where: { documentId: document.id } });
    expect(payments).toHaveLength(1);
  });
});

describe("paying an invoice that has a payment plan", () => {
  async function setUpPlannedInvoice(app: ReturnType<typeof createApp>) {
    const cookies = await registerAndGetCookies(app);
    await request(app).patch("/business/momo-settings").set("Cookie", cookies).send({
      enabled: true,
      environment: "sandbox",
      subscriptionKey: "sub-key",
      apiUser: "api-user",
      apiKey: "api-key",
    });
    const customer = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId: customer.body.customer.id,
        issueDate: "2026-10-01",
        lines: [{ description: "Cement", quantity: 1, unitPrice: 100000, taxRate: 0 }],
        installments: [
          { label: "Deposit", amount: 40000, dueDate: "2026-10-01" },
          { label: "Balance", amount: 60000, dueDate: "2099-01-01" },
        ],
      });
    const id = created.body.document.id as string;
    await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
    const fetched = await request(app).get(`/documents/${id}`).set("Cookie", cookies);
    return { id, cookies, publicToken: fetched.body.document.publicToken as string };
  }

  it("shows the plan and asks for the next instalment, not the whole amount", async () => {
    const app = createApp();
    const { publicToken } = await setUpPlannedInvoice(app);

    const res = await request(app).get(`/public/documents/${publicToken}`);

    expect(res.body.document.amountOwed).toBe(100000);
    expect(res.body.document.amountDue).toBe(40000);
    expect(res.body.document.nextInstallment).toMatchObject({ label: "Deposit", remaining: 40000 });
    expect(res.body.document.schedule).toHaveLength(2);
  });

  it("charges the deposit first, then the balance once the deposit is in", async () => {
    const app = createApp();
    const { id, cookies, publicToken } = await setUpPlannedInvoice(app);
    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
    const requestToPaySpy = vi.spyOn(momoClientModule, "requestToPay").mockResolvedValue(undefined);

    const first = await request(app)
      .post(`/public/documents/${publicToken}/momo/request`)
      .send({ phoneNumber: "250788000000" });
    await prisma.momoPaymentRequest.update({ where: { id: first.body.requestId }, data: { status: "SUCCESSFUL" } });
    await request(app)
      .post(`/documents/${id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 40000, method: "MOBILE_MONEY", paidOn: "2026-10-02" });
    const second = await request(app)
      .post(`/public/documents/${publicToken}/momo/request`)
      .send({ phoneNumber: "250788000000" });

    expect((await prisma.momoPaymentRequest.findUniqueOrThrow({ where: { id: first.body.requestId } })).amount).toBe(40000);
    expect((await prisma.momoPaymentRequest.findUniqueOrThrow({ where: { id: second.body.requestId } })).amount).toBe(60000);
    expect(requestToPaySpy).toHaveBeenCalledTimes(2);
  });

  it("asks for the whole amount when there is no plan", async () => {
    const app = createApp();
    const { document } = await setUpMomoInvoice(app, 10000);

    const res = await request(app).get(`/public/documents/${document.publicToken}`);

    expect(res.body.document.amountDue).toBe(10000);
    expect(res.body.document.schedule).toBeNull();
  });
});
