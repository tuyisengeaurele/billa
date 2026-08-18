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

async function createDocument(
  app: ReturnType<typeof createApp>,
  cookies: string[],
  customerId: string,
  type = "INVOICE",
) {
  const res = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type,
      customerId,
      issueDate: "2026-08-19",
      lines: [{ description: "Printing", quantity: 2, unitPrice: 5000, taxRate: 18 }],
    });
  return res.body.document.id as string;
}

describe("GET /documents", () => {
  it("returns documents scoped to the authenticated business and type", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId);
    await createDocument(app, cookies, customerId);

    const res = await request(app).get("/documents?type=INVOICE").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0].customer.name).toBe("Musanze Supplies");
  });

  it("only returns documents of the requested type", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId, "INVOICE");
    await createDocument(app, cookies, customerId, "QUOTE");

    const res = await request(app).get("/documents?type=INVOICE").set("Cookie", cookies);

    expect(res.body.total).toBe(1);
  });

  it("rejects a missing type with 400", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).get("/documents").set("Cookie", cookies);
    expect(res.status).toBe(400);
  });

  it("does not return another business's documents", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId);

    const otherRes = await request(app).post("/auth/register").send({
      email: "other@example.com",
      password: "Supersecret1!",
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).get("/documents?type=INVOICE").set("Cookie", otherCookies);
    expect(res.body.total).toBe(0);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/documents?type=INVOICE");
    expect(res.status).toBe(401);
  });
});
