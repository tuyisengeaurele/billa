import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

async function setUp(app: ReturnType<typeof createApp>) {
  const session = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  const cookies = session.headers["set-cookie"] as unknown as string[];
  const customer = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
  return { cookies, customerId: customer.body.customer.id as string };
}

async function finalizedInvoice(
  app: ReturnType<typeof createApp>,
  cookies: string[],
  customerId: string,
  extra: Record<string, unknown>,
  unitPrice: number,
  taxRate = 0,
) {
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: "2099-01-01",
      lines: [{ description: "Consulting", quantity: 1, unitPrice, taxRate }],
      ...extra,
    });
  const id = created.body.document.id as string;
  await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
  return id;
}

describe("overdue starts the day after the due date", () => {
  it("keeps an invoice due today current on the receivables page, and ages one due yesterday", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    await finalizedInvoice(app, cookies, customerId, { dueDate: new Date().toISOString().slice(0, 10) }, 1000);
    await finalizedInvoice(
      app,
      cookies,
      customerId,
      { dueDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10) },
      2000,
    );

    const res = await request(app).get("/receivables").set("Cookie", cookies);

    const byOwed = Object.fromEntries(res.body.results.map((row: { amountOwed: number }) => [row.amountOwed, row]));
    expect(byOwed[1000]).toMatchObject({ agingBucket: "current", daysOverdue: 0 });
    expect(byOwed[2000]).toMatchObject({ agingBucket: "0-30", daysOverdue: 1 });
  });
});

describe("reports with a foreign currency", () => {
  it("lists a foreign invoice in its own currency with its RWF equivalent", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    await finalizedInvoice(app, cookies, customerId, { currency: "USD", exchangeRate: 1450 }, 10000);

    const res = await request(app).get("/receivables").set("Cookie", cookies);

    expect(res.body.results[0]).toMatchObject({ currency: "USD", amountOwed: 10000, amountOwedRwf: 145000 });
  });

  it("counts a foreign invoice at its rate in the dashboard's outstanding figure", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    await finalizedInvoice(app, cookies, customerId, {}, 50000);
    await finalizedInvoice(app, cookies, customerId, { currency: "USD", exchangeRate: 1450 }, 10000);

    const res = await request(app).get("/dashboard/revenue").set("Cookie", cookies);

    expect(res.body.totalOutstanding).toBe(195000);
    expect(res.body.invoicedYearToDate).toBe(195000);
  });

  it("converts foreign lines to RWF in the tax summary", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    await finalizedInvoice(app, cookies, customerId, { currency: "USD", exchangeRate: 1450 }, 10000, 18);

    const res = await request(app).get("/reports/tax-summary").set("Cookie", cookies);

    expect(res.body.byRate).toEqual([{ rate: 18, taxableAmount: 145000, taxAmount: 26100 }]);
  });

  it("files the VAT register in RWF and keeps the original amount and rate alongside", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    await finalizedInvoice(app, cookies, customerId, { currency: "USD", exchangeRate: 1450 }, 10000, 18);

    const res = await request(app).get("/reports/vat-register.csv").set("Cookie", cookies);

    const [header, row] = res.text.trim().split(/\r?\n/);
    expect(header).toContain("Total (RWF)");
    expect(header).toContain("Rate to RWF");
    expect(row).toContain("145000");
    expect(row).toContain("26100");
    expect(row).toContain("USD");
    expect(row).toContain("118");
  });

  it("lists a customer's balance in RWF for the credit limit", async () => {
    const app = createApp();
    const { cookies, customerId } = await setUp(app);
    await finalizedInvoice(app, cookies, customerId, { currency: "USD", exchangeRate: 1450 }, 10000);

    const res = await request(app).get(`/customers/${customerId}`).set("Cookie", cookies);

    expect(res.body.customer.outstandingBalance).toBe(145000);
  });
});
