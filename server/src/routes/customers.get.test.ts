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

describe("GET /customers/:id", () => {
  it("returns the customer scoped to the authenticated business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const created = await request(app)
      .post("/customers")
      .set("Cookie", cookies)
      .send({ name: "Musanze Supplies", phone: "+250788000000" });

    const res = await request(app).get(`/customers/${created.body.customer.id}`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.customer.name).toBe("Musanze Supplies");
  });

  it("returns 404 for a customer belonging to another business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const created = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Musanze Supplies" });

    const otherRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).get(`/customers/${created.body.customer.id}`).set("Cookie", otherCookies);
    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/customers/some-id");
    expect(res.status).toBe(401);
  });
});
