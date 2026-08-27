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

describe("GET /documents/export.csv", () => {
  it("returns a CSV of the business's own documents", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customer = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
    await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId: customer.body.customer.id,
        issueDate: "2026-08-19",
        lines: [{ description: "Cement", quantity: 5, unitPrice: 13000, taxRate: 18 }],
      });

    const res = await request(app).get("/documents/export.csv").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.text).toContain("Type,Number,Status,Customer,Issue date,Due date,Total");
    expect(res.text).toContain("Acme Ltd");
    expect(res.text).toContain("76700");
  });

  it("does not include another business's documents", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app, "owner@example.com");
    const otherCookies = await registerAndGetCookies(app, "other@example.com");
    const customer = await request(app).post("/customers").set("Cookie", otherCookies).send({ name: "Other Corp" });
    await request(app)
      .post("/documents")
      .set("Cookie", otherCookies)
      .send({ type: "INVOICE", customerId: customer.body.customer.id, issueDate: "2026-08-19", lines: [] });

    const res = await request(app).get("/documents/export.csv").set("Cookie", cookies);
    expect(res.text).not.toContain("Other Corp");
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/documents/export.csv");
    expect(res.status).toBe(401);
  });
});

describe("GET /customers/export.csv", () => {
  it("returns a CSV of the business's own customers", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd", phone: "+250788000000" });

    const res = await request(app).get("/customers/export.csv").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("Name,Phone,Email,TIN,Status");
    expect(res.text).toContain("Acme Ltd");
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/customers/export.csv");
    expect(res.status).toBe(401);
  });
});

describe("GET /items/export.csv", () => {
  it("returns a CSV of the business's own items", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await request(app)
      .post("/items")
      .set("Cookie", cookies)
      .send({ description: "Cement bag", unitPrice: 13000, unit: "bag" });

    const res = await request(app).get("/items/export.csv").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("Description,Unit price,Unit,Status");
    expect(res.text).toContain("Cement bag");
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/items/export.csv");
    expect(res.status).toBe(401);
  });
});

describe("GET /export/all", () => {
  it("returns the business's own documents, customers, and items in one response", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customer = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
    await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId: customer.body.customer.id,
        issueDate: "2026-08-19",
        lines: [{ description: "Cement", quantity: 5, unitPrice: 13000, taxRate: 18 }],
      });
    await request(app).post("/items").set("Cookie", cookies).send({ description: "Cement bag", unitPrice: 13000, unit: "bag" });

    const res = await request(app).get("/export/all").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].customer).toBe("Acme Ltd");
    expect(res.body.customers).toHaveLength(1);
    expect(res.body.customers[0].name).toBe("Acme Ltd");
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].description).toBe("Cement bag");
    expect(res.body.exportedAt).toBeTruthy();
  });

  it("does not include another business's data", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app, "owner@example.com");
    const otherCookies = await registerAndGetCookies(app, "other@example.com");
    await request(app).post("/customers").set("Cookie", otherCookies).send({ name: "Other Corp" });

    const res = await request(app).get("/export/all").set("Cookie", cookies);

    expect(res.body.customers).toHaveLength(0);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/export/all");
    expect(res.status).toBe(401);
  });
});
