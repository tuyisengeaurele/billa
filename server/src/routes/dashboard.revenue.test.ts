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

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[], name = "Musanze Supplies") {
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name });
  return res.body.customer.id as string;
}

async function createDocument(
  app: ReturnType<typeof createApp>,
  cookies: string[],
  customerId: string,
  type: string,
  unitPrice: number,
  referencedDocumentId?: string,
) {
  const res = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type,
      customerId,
      issueDate: new Date().toISOString().slice(0, 10),
      lines: [{ description: "Cement", quantity: 1, unitPrice, taxRate: 0 }],
      ...(referencedDocumentId ? { referencedDocumentId } : {}),
    });
  return res.body.document as { id: string; total: number };
}

async function finalizeDocument(app: ReturnType<typeof createApp>, cookies: string[], id: string) {
  const res = await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
  return res.body.document as { id: string; total: number };
}

describe("GET /dashboard/revenue", () => {
  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/dashboard/revenue");
    expect(res.status).toBe(401);
  });

  it("sums finalized invoices into this month's invoiced total", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const invoice = await createDocument(app, cookies, customerId, "INVOICE", 100000);
    await finalizeDocument(app, cookies, invoice.id);

    const res = await request(app).get("/dashboard/revenue").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.invoicedThisMonth).toBe(100000);
    expect(res.body.invoicedYearToDate).toBe(100000);
  });

  it("excludes draft invoices from the totals", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId, "INVOICE", 100000);

    const res = await request(app).get("/dashboard/revenue").set("Cookie", cookies);

    expect(res.body.invoicedThisMonth).toBe(0);
  });

  it("excludes non-invoice, non-credit-note document types from the totals", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const quote = await createDocument(app, cookies, customerId, "QUOTE", 50000);
    await finalizeDocument(app, cookies, quote.id);

    const res = await request(app).get("/dashboard/revenue").set("Cookie", cookies);

    expect(res.body.invoicedThisMonth).toBe(0);
  });

  it("nets finalized credit notes against invoiced revenue", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const invoice = await createDocument(app, cookies, customerId, "INVOICE", 100000);
    await finalizeDocument(app, cookies, invoice.id);
    const creditNote = await createDocument(app, cookies, customerId, "CREDIT_NOTE", 30000, invoice.id);
    await finalizeDocument(app, cookies, creditNote.id);

    const res = await request(app).get("/dashboard/revenue").set("Cookie", cookies);

    expect(res.body.invoicedYearToDate).toBe(100000);
    expect(res.body.creditedYearToDate).toBe(30000);
    expect(res.body.netYearToDate).toBe(70000);
  });

  it("includes 6 months of monthly revenue, most recent last", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createDocument(app, cookies, customerId, "INVOICE", 100000);
    await finalizeDocument(app, cookies, invoice.id);

    const res = await request(app).get("/dashboard/revenue").set("Cookie", cookies);

    expect(res.body.monthlyRevenue).toHaveLength(6);
    const thisMonthKey = new Date().toISOString().slice(0, 7);
    expect(res.body.monthlyRevenue[5].month).toBe(thisMonthKey);
    expect(res.body.monthlyRevenue[5].invoiced).toBe(100000);
    expect(res.body.monthlyRevenue[5].net).toBe(100000);
  });

  it("ranks top customers by net invoiced total", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const bigCustomer = await createCustomer(app, cookies, "Big Spender Ltd");
    const smallCustomer = await createCustomer(app, cookies, "Small Spender Ltd");

    const bigInvoice = await createDocument(app, cookies, bigCustomer, "INVOICE", 500000);
    await finalizeDocument(app, cookies, bigInvoice.id);
    const smallInvoice = await createDocument(app, cookies, smallCustomer, "INVOICE", 20000);
    await finalizeDocument(app, cookies, smallInvoice.id);

    const res = await request(app).get("/dashboard/revenue").set("Cookie", cookies);

    expect(res.body.topCustomers[0].name).toBe("Big Spender Ltd");
    expect(res.body.topCustomers[0].total).toBe(500000);
    expect(res.body.topCustomers[1].name).toBe("Small Spender Ltd");
  });

  it("does not include another business's documents", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createDocument(app, cookies, customerId, "INVOICE", 100000);
    await finalizeDocument(app, cookies, invoice.id);

    const otherRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).get("/dashboard/revenue").set("Cookie", otherCookies);

    expect(res.body.invoicedYearToDate).toBe(0);
    expect(res.body.topCustomers).toHaveLength(0);
  });

  it("sums collected payments and outstanding balances", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const paidInvoice = await createDocument(app, cookies, customerId, "INVOICE", 100000);
    await finalizeDocument(app, cookies, paidInvoice.id);
    await request(app)
      .post(`/documents/${paidInvoice.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 100000, method: "CASH", paidOn: new Date().toISOString().slice(0, 10) });

    const unpaidInvoice = await createDocument(app, cookies, customerId, "INVOICE", 40000);
    await finalizeDocument(app, cookies, unpaidInvoice.id);

    const res = await request(app).get("/dashboard/revenue").set("Cookie", cookies);

    expect(res.body.totalCollected).toBe(100000);
    expect(res.body.totalOutstanding).toBe(40000);
  });

  it("computes days sales outstanding from recently completed payments", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createDocument(app, cookies, customerId, "INVOICE", 100000);
    await finalizeDocument(app, cookies, invoice.id);
    await request(app)
      .post(`/documents/${invoice.id}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 100000, method: "CASH", paidOn: new Date().toISOString().slice(0, 10) });

    const res = await request(app).get("/dashboard/revenue").set("Cookie", cookies);

    expect(res.body.daysSalesOutstanding).toBe(0);
  });

  it("returns null for days sales outstanding when nothing was paid off recently", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createDocument(app, cookies, customerId, "INVOICE", 100000);
    await finalizeDocument(app, cookies, invoice.id);

    const res = await request(app).get("/dashboard/revenue").set("Cookie", cookies);

    expect(res.body.daysSalesOutstanding).toBeNull();
  });
});
