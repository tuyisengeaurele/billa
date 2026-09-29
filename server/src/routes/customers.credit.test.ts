import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

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
      lines: [{ description: "Cement", quantity: 1, unitPrice, taxRate: 0 }],
    });
  await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);
  return created.body.document.id as string;
}

describe("customer credit limit", () => {
  it("saves a limit when the customer is created, and changes or clears it", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createCustomer(app, cookies, { name: "Acme Ltd", creditLimit: 500000 });

    const first = await request(app).get(`/customers/${id}`).set("Cookie", cookies);
    await request(app).patch(`/customers/${id}`).set("Cookie", cookies).send({ creditLimit: 800000 });
    const changed = await request(app).get(`/customers/${id}`).set("Cookie", cookies);
    await request(app).patch(`/customers/${id}`).set("Cookie", cookies).send({ creditLimit: null });
    const cleared = await request(app).get(`/customers/${id}`).set("Cookie", cookies);

    expect(first.body.customer.creditLimit).toBe(500000);
    expect(changed.body.customer.creditLimit).toBe(800000);
    expect(cleared.body.customer.creditLimit).toBeNull();
  });

  it("rejects a limit of zero", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd", creditLimit: 0 });

    expect(res.status).toBe(400);
  });
});

describe("GET /customers/:id outstandingBalance", () => {
  it("is zero for a customer who owes nothing", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createCustomer(app, cookies, { name: "Acme Ltd" });

    const res = await request(app).get(`/customers/${id}`).set("Cookie", cookies);

    expect(res.body.customer.outstandingBalance).toBe(0);
  });

  it("adds up what is still owed on finalized invoices, net of payments", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createCustomer(app, cookies, { name: "Acme Ltd" });
    const first = await createFinalizedInvoice(app, cookies, id, 10000);
    await createFinalizedInvoice(app, cookies, id, 4000);
    await request(app)
      .post(`/documents/${first}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 3000, method: "CASH", paidOn: "2026-09-02" });

    const res = await request(app).get(`/customers/${id}`).set("Cookie", cookies);

    expect(res.body.customer.outstandingBalance).toBe(11000);
  });

  it("ignores drafts and other customers' invoices", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createCustomer(app, cookies, { name: "Acme Ltd" });
    const otherId = await createCustomer(app, cookies, { name: "Beta Co" });
    await createFinalizedInvoice(app, cookies, otherId, 9000);
    await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "INVOICE", customerId: id, issueDate: "2026-09-01", lines: [{ description: "x", quantity: 1, unitPrice: 5000, taxRate: 0 }] });

    const res = await request(app).get(`/customers/${id}`).set("Cookie", cookies);

    expect(res.body.customer.outstandingBalance).toBe(0);
  });
});
