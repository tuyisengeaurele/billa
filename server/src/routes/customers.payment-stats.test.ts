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

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[]) {
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Musanze Supplies" });
  return res.body.customer.id as string;
}

async function createPaidInvoice(
  app: ReturnType<typeof createApp>,
  cookies: string[],
  customerId: string,
  dueDate: string,
  paidOn: string,
) {
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-01-01",
      dueDate,
      lines: [{ description: "Printing", quantity: 1, unitPrice: 5900, taxRate: 0 }],
    });
  const id = created.body.document.id as string;
  await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
  await request(app)
    .post(`/documents/${id}/payments`)
    .set("Cookie", cookies)
    .send({ amount: 5900, method: "CASH", paidOn });
  return id;
}

describe("GET /customers/:id/payment-stats", () => {
  it("computes the average days to pay and on-time rate across paid invoices", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    // paid 2 days early
    await createPaidInvoice(app, cookies, customerId, "2026-01-10", "2026-01-08");
    // paid 4 days late
    await createPaidInvoice(app, cookies, customerId, "2026-01-10", "2026-01-14");

    const res = await request(app).get(`/customers/${customerId}/payment-stats`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.paidInvoiceCount).toBe(2);
    expect(res.body.averageDaysToPay).toBe(1);
    expect(res.body.onTimeRate).toBe(50);
  });

  it("returns nulls when the customer has no paid invoices yet", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const res = await request(app).get(`/customers/${customerId}/payment-stats`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.paidInvoiceCount).toBe(0);
    expect(res.body.averageDaysToPay).toBeNull();
    expect(res.body.onTimeRate).toBeNull();
  });

  it("returns 404 for a customer belonging to another business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const otherRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });

    const res = await request(app)
      .get(`/customers/${customerId}/payment-stats`)
      .set("Cookie", otherRes.headers["set-cookie"] as unknown as string[]);

    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/customers/some-id/payment-stats");
    expect(res.status).toBe(401);
  });
});
