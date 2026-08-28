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
  const res = await request(app)
    .post("/auth/session")
    .send({ idToken: JSON.stringify({ uid: email, email }), businessName: "Kigali Traders" });
  return res.headers["set-cookie"] as unknown as string[];
}

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[], name: string) {
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name });
  return res.body.customer.id as string;
}

async function createItem(app: ReturnType<typeof createApp>, cookies: string[], description: string) {
  await request(app)
    .post("/items")
    .set("Cookie", cookies)
    .send({ description, unitPrice: 1000, unit: "piece" });
}

async function createDocument(app: ReturnType<typeof createApp>, cookies: string[], customerId: string) {
  const res = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-19",
      lines: [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }],
    });
  return res.body.document.id as string;
}

describe("GET /search", () => {
  it("returns matching customers, items, and documents grouped by type", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, "Kigali Traders");
    await createItem(app, cookies, "Kigali printing service");
    const documentId = await createDocument(app, cookies, customerId);

    const res = await request(app).get("/search?q=kigali").set("Cookie", cookies);

    expect(res.status).toBe(200);
    const types = res.body.results.map((r: { type: string }) => r.type);
    expect(types).toContain("customer");
    expect(types).toContain("item");
    expect(types).toContain("document");
    const customerResult = res.body.results.find((r: { type: string }) => r.type === "customer");
    expect(customerResult).toMatchObject({
      id: customerId,
      label: "Kigali Traders",
      href: `/customers/${customerId}/statement`,
    });
    const documentResult = res.body.results.find((r: { type: string }) => r.type === "document");
    expect(documentResult).toMatchObject({ id: documentId, documentType: "INVOICE", href: `/documents/${documentId}` });
  });

  it("matches a document by its customer's name, not just its own number", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, "Musanze Supplies");
    await createDocument(app, cookies, customerId);

    const res = await request(app).get("/search?q=musanze").set("Cookie", cookies);

    expect(res.body.results.some((r: { type: string }) => r.type === "document")).toBe(true);
  });

  it("does not return another business's data", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app, "owner@example.com");
    await createCustomer(app, cookies, "Kigali Traders");

    const otherCookies = await registerAndGetCookies(app, "other@example.com");
    const res = await request(app).get("/search?q=kigali").set("Cookie", otherCookies);

    expect(res.body.results).toHaveLength(0);
  });

  it("rejects a query shorter than 2 characters", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).get("/search?q=k").set("Cookie", cookies);

    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/search?q=kigali");
    expect(res.status).toBe(401);
  });
});
