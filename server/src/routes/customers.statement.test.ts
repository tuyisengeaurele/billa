import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";
import { prisma } from "../lib/prisma.js";
import * as mailerModule from "../lib/mailer.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
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

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[], body: Record<string, unknown>) {
  const res = await request(app).post("/customers").set("Cookie", cookies).send(body);
  return res.body.customer.id as string;
}

async function createFinalizedInvoice(app: ReturnType<typeof createApp>, cookies: string[], customerId: string, unitPrice: number) {
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-09-01",
      dueDate: "2026-09-30",
      lines: [{ description: "Cement", quantity: 1, unitPrice, taxRate: 0 }],
    });
  await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);
  return created.body.document.id as string;
}

describe("POST /customers/:id/send-statement", () => {
  it("emails the customer a list of what they owe with a link to their portal", async () => {
    const sendSpy = vi.spyOn(mailerModule, "sendEmail").mockResolvedValue();
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, { name: "Acme Ltd", email: "acme@example.com" });
    await createFinalizedInvoice(app, cookies, customerId, 10000);
    await createFinalizedInvoice(app, cookies, customerId, 4000);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });

    const res = await request(app).post(`/customers/${customerId}/send-statement`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sentTo: "acme@example.com", invoiceCount: 2, totalOwed: 14000 });
    const call = sendSpy.mock.calls[0]![0];
    expect(call.to).toBe("acme@example.com");
    expect(call.subject).toBe("Your statement from Kigali Traders");
    expect(call.html).toContain("INV-0001");
    expect(call.html).toContain("14,000 RWF");
    expect(call.html).toContain(`/portal/${customer.portalToken}`);
  });

  it("only lists what is still owed", async () => {
    const sendSpy = vi.spyOn(mailerModule, "sendEmail").mockResolvedValue();
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, { name: "Acme Ltd", email: "acme@example.com" });
    const paid = await createFinalizedInvoice(app, cookies, customerId, 10000);
    await createFinalizedInvoice(app, cookies, customerId, 4000);
    await request(app)
      .post(`/documents/${paid}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 10000, method: "CASH", paidOn: "2026-09-02" });

    const res = await request(app).post(`/customers/${customerId}/send-statement`).set("Cookie", cookies);

    expect(res.body).toMatchObject({ invoiceCount: 1, totalOwed: 4000 });
    expect(sendSpy.mock.calls[0]![0].html).not.toContain("INV-0001");
  });

  it("returns 409 and sends nothing when the customer owes nothing", async () => {
    const sendSpy = vi.spyOn(mailerModule, "sendEmail").mockResolvedValue();
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, { name: "Acme Ltd", email: "acme@example.com" });

    const res = await request(app).post(`/customers/${customerId}/send-statement`).set("Cookie", cookies);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("nothing_owed");
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("returns 400 when the customer has no email", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, { name: "Acme Ltd" });
    await createFinalizedInvoice(app, cookies, customerId, 10000);

    const res = await request(app).post(`/customers/${customerId}/send-statement`).set("Cookie", cookies);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("customer_has_no_email");
  });

  it("returns 404 for a customer of another business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const other = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });
    const otherCookies = other.headers["set-cookie"] as unknown as string[];
    const customerId = await createCustomer(app, otherCookies, { name: "Acme Ltd", email: "acme@example.com" });

    const res = await request(app).post(`/customers/${customerId}/send-statement`).set("Cookie", cookies);

    expect(res.status).toBe(404);
  });

  it("returns 502 when the email provider fails", async () => {
    vi.spyOn(mailerModule, "sendEmail").mockRejectedValue(new Error("provider down"));
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, { name: "Acme Ltd", email: "acme@example.com" });
    await createFinalizedInvoice(app, cookies, customerId, 10000);

    const res = await request(app).post(`/customers/${customerId}/send-statement`).set("Cookie", cookies);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("email_send_failed");
  });

  it("says the customer can pay online when the business takes MoMo", async () => {
    const sendSpy = vi.spyOn(mailerModule, "sendEmail").mockResolvedValue();
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await prisma.business.updateMany({ data: { momoEnabled: true } });
    const customerId = await createCustomer(app, cookies, { name: "Acme Ltd", email: "acme@example.com" });
    await createFinalizedInvoice(app, cookies, customerId, 10000);

    await request(app).post(`/customers/${customerId}/send-statement`).set("Cookie", cookies);

    expect(sendSpy.mock.calls[0]![0].html).toContain(">View and pay online<");
  });
});
