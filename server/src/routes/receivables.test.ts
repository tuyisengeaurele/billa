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

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[], name = "Acme Ltd") {
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name });
  return res.body.customer.id as string;
}

async function createFinalizedInvoice(
  app: ReturnType<typeof createApp>,
  cookies: string[],
  customerId: string,
  dueDate: string,
  unitPrice = 100000,
) {
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-01",
      dueDate,
      lines: [{ description: "Cement", quantity: 1, unitPrice, taxRate: 0 }],
    });
  await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);
  return created.body.document as { id: string };
}

describe("GET /receivables", () => {
  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/receivables");
    expect(res.status).toBe(401);
  });

  it("lists an unpaid finalized invoice", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createFinalizedInvoice(app, cookies, customerId, "2099-01-01");

    const res = await request(app).get("/receivables").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].customerName).toBe("Acme Ltd");
    expect(res.body.results[0].amountOwed).toBe(100000);
  });

  it("excludes a fully paid invoice", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createFinalizedInvoice(app, cookies, customerId, "2099-01-01");
    await request(app)
      .post(`/documents/${invoice.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 100000, method: "CASH", paidOn: "2026-08-02" });

    const res = await request(app).get("/receivables").set("Cookie", cookies);

    expect(res.body.results).toHaveLength(0);
  });

  it("excludes a written-off invoice", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createFinalizedInvoice(app, cookies, customerId, "2099-01-01");
    await request(app)
      .post(`/documents/${invoice.id}/write-off`)
      .set("Cookie", cookies)
      .send({ writeOffReason: "Gone out of business" });

    const res = await request(app).get("/receivables").set("Cookie", cookies);

    expect(res.body.results).toHaveLength(0);
  });

  it("buckets an overdue invoice by days past due", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await createFinalizedInvoice(app, cookies, customerId, fortyDaysAgo);

    const res = await request(app).get("/receivables").set("Cookie", cookies);

    expect(res.body.results[0].agingBucket).toBe("31-60");
  });

  it("buckets a not-yet-due invoice as current", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createFinalizedInvoice(app, cookies, customerId, "2099-01-01");

    const res = await request(app).get("/receivables").set("Cookie", cookies);

    expect(res.body.results[0].agingBucket).toBe("current");
  });

  it("nets a finalized credit note against the amount owed", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createFinalizedInvoice(app, cookies, customerId, "2099-01-01");
    const creditNote = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "CREDIT_NOTE",
        customerId,
        issueDate: "2026-08-05",
        lines: [{ description: "Return", quantity: 1, unitPrice: 20000, taxRate: 0 }],
        referencedDocumentId: invoice.id,
      });
    await request(app).post(`/documents/${creditNote.body.document.id}/finalize`).set("Cookie", cookies);

    const res = await request(app).get("/receivables").set("Cookie", cookies);

    expect(res.body.results[0].amountOwed).toBe(80000);
  });

  it("does not include another business's invoices", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app, "owner@example.com");
    const otherCookies = await registerAndGetCookies(app, "other@example.com");
    const otherCustomerId = await createCustomer(app, otherCookies, "Other Corp");
    await createFinalizedInvoice(app, otherCookies, otherCustomerId, "2099-01-01");

    const res = await request(app).get("/receivables").set("Cookie", cookies);

    expect(res.body.results).toHaveLength(0);
  });
});
