import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

async function registerAndGetCookies(app: ReturnType<typeof createApp>, email = "owner@example.com") {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: email, email }),
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[]) {
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
  return res.body.customer.id as string;
}

async function createFinalizedInvoice(app: ReturnType<typeof createApp>, cookies: string[], customerId: string, unitPrice = 100000) {
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-19",
      lines: [{ description: "Cement", quantity: 1, unitPrice, taxRate: 0 }],
    });
  await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);
  return created.body.document as { id: string };
}

describe("POST /documents/:id/payments", () => {
  it("records a payment and updates the invoice's payment status", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createFinalizedInvoice(app, cookies, customerId);

    const res = await request(app)
      .post(`/documents/${invoice.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 40000, method: "CASH", paidOn: "2026-08-20" });

    expect(res.status).toBe(201);
    expect(res.body.document.paymentStatus).toBe("PARTIALLY_PAID");
    expect(res.body.document.amountPaid).toBe(40000);
  });

  it("marks the invoice PAID once fully paid", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createFinalizedInvoice(app, cookies, customerId);

    const res = await request(app)
      .post(`/documents/${invoice.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 100000, method: "BANK_TRANSFER", paidOn: "2026-08-20" });

    expect(res.body.document.paymentStatus).toBe("PAID");
  });

  it("generates a finalized receipt when requested", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createFinalizedInvoice(app, cookies, customerId);

    const res = await request(app)
      .post(`/documents/${invoice.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 100000, method: "CASH", paidOn: "2026-08-20", generateReceipt: true });

    expect(res.body.payment.receiptDocumentId).toBeTruthy();

    const receipt = await request(app)
      .get(`/documents/${res.body.payment.receiptDocumentId}`)
      .set("Cookie", cookies);
    expect(receipt.body.document.status).toBe("FINALIZED");
    expect(receipt.body.document.type).toBe("RECEIPT");
    expect(receipt.body.document.referencedDocument.id).toBe(invoice.id);
    expect(receipt.body.document.total).toBe(100000);
  });

  it("does not generate a receipt unless requested", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createFinalizedInvoice(app, cookies, customerId);

    const res = await request(app)
      .post(`/documents/${invoice.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 50000, method: "CASH", paidOn: "2026-08-20" });

    expect(res.body.payment.receiptDocumentId).toBeNull();
  });

  it("rejects an amount greater than what's owed", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createFinalizedInvoice(app, cookies, customerId);

    const res = await request(app)
      .post(`/documents/${invoice.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 200000, method: "CASH", paidOn: "2026-08-20" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("amount_exceeds_owed");
  });

  it("accounts for finalized credit notes when checking the amount owed", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createFinalizedInvoice(app, cookies, customerId);

    const creditNote = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "CREDIT_NOTE",
        customerId,
        issueDate: "2026-08-20",
        lines: [{ description: "Return", quantity: 1, unitPrice: 30000, taxRate: 0 }],
        referencedDocumentId: invoice.id,
      });
    await request(app).post(`/documents/${creditNote.body.document.id}/finalize`).set("Cookie", cookies);

    const res = await request(app)
      .post(`/documents/${invoice.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 70000, method: "CASH", paidOn: "2026-08-21" });

    expect(res.status).toBe(201);
    expect(res.body.document.paymentStatus).toBe("PAID");
  });

  it("rejects recording a payment against a draft invoice", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "INVOICE", customerId, issueDate: "2026-08-19", lines: [] });

    const res = await request(app)
      .post(`/documents/${created.body.document.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 1000, method: "CASH", paidOn: "2026-08-20" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("not_finalized");
  });

  it("rejects recording a payment against a non-invoice document", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "QUOTE", customerId, issueDate: "2026-08-19", lines: [{ description: "x", quantity: 1, unitPrice: 100, taxRate: 0 }] });
    await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);

    const res = await request(app)
      .post(`/documents/${created.body.document.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 100, method: "CASH", paidOn: "2026-08-20" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("not_an_invoice");
  });

  it("does not let one business record a payment against another business's invoice", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app, "owner@example.com");
    const otherCookies = await registerAndGetCookies(app, "other@example.com");
    const otherCustomerId = await createCustomer(app, otherCookies);
    const otherInvoice = await createFinalizedInvoice(app, otherCookies, otherCustomerId);

    const res = await request(app)
      .post(`/documents/${otherInvoice.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 1000, method: "CASH", paidOn: "2026-08-20" });

    expect(res.status).toBe(404);
  });
});

describe("GET /documents/:id/payments", () => {
  it("lists payments recorded against an invoice, newest first", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createFinalizedInvoice(app, cookies, customerId);

    await request(app)
      .post(`/documents/${invoice.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 30000, method: "CASH", paidOn: "2026-08-19" });
    await request(app)
      .post(`/documents/${invoice.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 20000, method: "MOBILE_MONEY", paidOn: "2026-08-21" });

    const res = await request(app).get(`/documents/${invoice.id}/payments`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.payments).toHaveLength(2);
    expect(res.body.payments[0].amount).toBe(20000);
  });
});

describe("POST /documents/:id/payments/:paymentId/void", () => {
  it("voids a payment and recomputes the invoice's payment status", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createFinalizedInvoice(app, cookies, customerId);

    const payment = await request(app)
      .post(`/documents/${invoice.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 100000, method: "CASH", paidOn: "2026-08-20" });
    expect(payment.body.document.paymentStatus).toBe("PAID");

    const res = await request(app)
      .post(`/documents/${invoice.id}/payments/${payment.body.payment.id}/void`)
      .set("Cookie", cookies)
      .send({ voidReason: "Entered by mistake" });

    expect(res.status).toBe(200);
    expect(res.body.document.paymentStatus).toBe("UNPAID");
    expect(res.body.document.amountPaid).toBe(0);
  });

  it("returns 409 when voiding an already-voided payment", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createFinalizedInvoice(app, cookies, customerId);

    const payment = await request(app)
      .post(`/documents/${invoice.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 100000, method: "CASH", paidOn: "2026-08-20" });
    await request(app)
      .post(`/documents/${invoice.id}/payments/${payment.body.payment.id}/void`)
      .set("Cookie", cookies)
      .send({ voidReason: "Mistake" });

    const res = await request(app)
      .post(`/documents/${invoice.id}/payments/${payment.body.payment.id}/void`)
      .set("Cookie", cookies)
      .send({ voidReason: "Mistake again" });

    expect(res.status).toBe(409);
  });

  it("returns 404 for an unknown payment", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createFinalizedInvoice(app, cookies, customerId);

    const res = await request(app)
      .post(`/documents/${invoice.id}/payments/nonexistent/void`)
      .set("Cookie", cookies)
      .send({ voidReason: "Mistake" });

    expect(res.status).toBe(404);
  });
});
