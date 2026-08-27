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
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
  return res.body.customer as { id: string; portalToken: string };
}

describe("GET /public/customers/:token", () => {
  it("returns 404 for an unknown token", async () => {
    const res = await request(createApp()).get("/public/customers/nonexistent-token");
    expect(res.status).toBe(404);
  });

  it("returns the customer's name and their finalized documents, no auth required", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customer = await createCustomer(app, cookies);

    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId: customer.id,
        issueDate: "2026-08-19",
        lines: [{ description: "Cement", quantity: 1, unitPrice: 100000, taxRate: 0 }],
      });
    await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);

    const res = await request(app).get(`/public/customers/${customer.portalToken}`);

    expect(res.status).toBe(200);
    expect(res.body.customer.name).toBe("Acme Ltd");
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].number).toBe("INV-0001");
    expect(res.body.documents[0].total).toBe(100000);
    expect(res.body.documents[0].publicToken).toBeTruthy();
  });

  it("excludes draft documents", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customer = await createCustomer(app, cookies);

    await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "INVOICE", customerId: customer.id, issueDate: "2026-08-19", lines: [] });

    const res = await request(app).get(`/public/customers/${customer.portalToken}`);

    expect(res.body.documents).toHaveLength(0);
  });

  it("does not include another customer's documents", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customer = await createCustomer(app, cookies);
    const otherCustomer = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Other Ltd" });

    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId: otherCustomer.body.customer.id,
        issueDate: "2026-08-19",
        lines: [{ description: "Cement", quantity: 1, unitPrice: 100000, taxRate: 0 }],
      });
    await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);

    const res = await request(app).get(`/public/customers/${customer.portalToken}`);

    expect(res.body.documents).toHaveLength(0);
  });
});
