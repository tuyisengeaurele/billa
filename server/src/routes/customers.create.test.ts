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

describe("POST /customers", () => {
  it("creates a customer scoped to the authenticated business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/customers")
      .set("Cookie", cookies)
      .send({ name: "Kigali Traders Ltd", phone: "+250788000000" });

    expect(res.status).toBe(201);
    expect(res.body.customer.name).toBe("Kigali Traders Ltd");
    expect(res.body.customer.isActive).toBe(true);
  });

  it("rejects a missing name with 400", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).post("/customers").set("Cookie", cookies).send({});
    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/customers").send({ name: "Kigali Traders Ltd" });
    expect(res.status).toBe(401);
  });
});
