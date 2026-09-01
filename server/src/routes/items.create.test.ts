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

describe("POST /items", () => {
  it("creates an item scoped to the authenticated business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/items")
      .set("Cookie", cookies)
      .send({ description: "Printing service", unitPrice: 5000, unit: "service" });

    expect(res.status).toBe(201);
    expect(res.body.item.description).toBe("Printing service");
    expect(res.body.item.isActive).toBe(true);
  });

  it("defaults the tax rate to 18 when not provided", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/items")
      .set("Cookie", cookies)
      .send({ description: "Printing service", unitPrice: 5000, unit: "service" });

    expect(Number(res.body.item.taxRate)).toBe(18);
  });

  it("accepts an explicit tax rate for a VAT-exempt item", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/items")
      .set("Cookie", cookies)
      .send({ description: "Bread", unitPrice: 500, unit: "piece", taxRate: 0 });

    expect(Number(res.body.item.taxRate)).toBe(0);
  });

  it("rejects a zero price with 400", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/items")
      .set("Cookie", cookies)
      .send({ description: "Printing service", unitPrice: 0, unit: "service" });
    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp())
      .post("/items")
      .send({ description: "Printing service", unitPrice: 5000, unit: "service" });
    expect(res.status).toBe(401);
  });
});
