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
  const res = await request(app).post("/auth/register").send({
    email: "owner@example.com",
    password: "Supersecret1!",
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[]) {
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Musanze Supplies" });
  return res.body.customer.id as string;
}

async function createDraft(
  app: ReturnType<typeof createApp>,
  cookies: string[],
  customerId: string,
  hasLine = true,
) {
  const res = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-19",
      lines: hasLine ? [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }] : [],
    });
  return res.body.document.id as string;
}

describe("POST /documents/:id/finalize", () => {
  it("assigns INV-0001 to the first finalized invoice for a business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const id = await createDraft(app, cookies, customerId);

    const res = await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.document.number).toBe("INV-0001");
    expect(res.body.document.status).toBe("FINALIZED");
  });

  it("assigns sequential numbers across repeated finalizes", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const firstId = await createDraft(app, cookies, customerId);
    await request(app).post(`/documents/${firstId}/finalize`).set("Cookie", cookies);

    const secondId = await createDraft(app, cookies, customerId);
    const res = await request(app).post(`/documents/${secondId}/finalize`).set("Cookie", cookies);

    expect(res.body.document.number).toBe("INV-0002");
  });

  it("rejects finalizing a document with no lines", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const id = await createDraft(app, cookies, customerId, false);

    const res = await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
    expect(res.status).toBe(400);
  });

  it("rejects finalizing an already-finalized document", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const id = await createDraft(app, cookies, customerId);
    await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);

    const res = await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
    expect(res.status).toBe(409);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/documents/x/finalize");
    expect(res.status).toBe(401);
  });
});
