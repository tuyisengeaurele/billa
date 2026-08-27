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
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Musanze Supplies" });
  return res.body.customer.id as string;
}

async function createFinalizedDocument(
  app: ReturnType<typeof createApp>,
  cookies: string[],
  customerId: string,
  type: string,
  issueDate: string,
  unitPrice: number,
  taxRate: number,
  referencedDocumentId?: string,
) {
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type,
      customerId,
      issueDate,
      lines: [{ description: "Cement", quantity: 1, unitPrice, taxRate }],
      ...(referencedDocumentId ? { referencedDocumentId } : {}),
    });
  await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);
  return created.body.document as { id: string };
}

describe("GET /reports/tax-summary", () => {
  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/reports/tax-summary");
    expect(res.status).toBe(401);
  });

  it("sums tax collected from finalized invoices", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createFinalizedDocument(app, cookies, customerId, "INVOICE", "2026-08-19", 100000, 18);

    const res = await request(app).get("/reports/tax-summary").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.totalTaxInvoiced).toBe(18000);
    expect(res.body.totalTaxCollected).toBe(18000);
    expect(res.body.byRate).toEqual([{ rate: 18, taxableAmount: 100000, taxAmount: 18000 }]);
  });

  it("nets out tax from finalized credit notes", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createFinalizedDocument(app, cookies, customerId, "INVOICE", "2026-08-19", 100000, 18);
    await createFinalizedDocument(app, cookies, customerId, "CREDIT_NOTE", "2026-08-20", 20000, 18, invoice.id);

    const res = await request(app).get("/reports/tax-summary").set("Cookie", cookies);

    expect(res.body.totalTaxInvoiced).toBe(18000);
    expect(res.body.totalTaxCredited).toBe(3600);
    expect(res.body.totalTaxCollected).toBe(14400);
  });

  it("excludes draft documents", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId,
        issueDate: "2026-08-19",
        lines: [{ description: "Cement", quantity: 1, unitPrice: 100000, taxRate: 18 }],
      });

    const res = await request(app).get("/reports/tax-summary").set("Cookie", cookies);

    expect(res.body.totalTaxInvoiced).toBe(0);
  });

  it("excludes non-invoice, non-credit-note types", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createFinalizedDocument(app, cookies, customerId, "QUOTE", "2026-08-19", 100000, 18);

    const res = await request(app).get("/reports/tax-summary").set("Cookie", cookies);

    expect(res.body.totalTaxInvoiced).toBe(0);
  });

  it("filters by an issue date range", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createFinalizedDocument(app, cookies, customerId, "INVOICE", "2026-01-01", 100000, 18);
    await createFinalizedDocument(app, cookies, customerId, "INVOICE", "2026-08-19", 50000, 18);

    const res = await request(app)
      .get("/reports/tax-summary?from=2026-08-01&to=2026-08-31")
      .set("Cookie", cookies);

    expect(res.body.totalTaxInvoiced).toBe(9000);
  });

  it("groups separate tax rates into separate buckets", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createFinalizedDocument(app, cookies, customerId, "INVOICE", "2026-08-19", 100000, 18);
    await createFinalizedDocument(app, cookies, customerId, "INVOICE", "2026-08-19", 50000, 0);

    const res = await request(app).get("/reports/tax-summary").set("Cookie", cookies);

    expect(res.body.byRate).toEqual([
      { rate: 0, taxableAmount: 50000, taxAmount: 0 },
      { rate: 18, taxableAmount: 100000, taxAmount: 18000 },
    ]);
  });

  it("does not include another business's documents", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app, "owner@example.com");
    const otherCookies = await registerAndGetCookies(app, "other@example.com");
    const otherCustomerId = await createCustomer(app, otherCookies);
    await createFinalizedDocument(app, otherCookies, otherCustomerId, "INVOICE", "2026-08-19", 100000, 18);

    const res = await request(app).get("/reports/tax-summary").set("Cookie", cookies);

    expect(res.body.totalTaxInvoiced).toBe(0);
  });
});
