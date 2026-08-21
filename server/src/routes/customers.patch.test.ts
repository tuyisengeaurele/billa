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
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Kigali Traders Ltd" });
  return res.body.customer.id as string;
}

describe("PATCH /customers/:id", () => {
  it("updates the provided fields", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createCustomer(app, cookies);

    const res = await request(app).patch(`/customers/${id}`).set("Cookie", cookies).send({ phone: "+250788000000" });

    expect(res.status).toBe(200);
    expect(res.body.customer.phone).toBe("+250788000000");
  });

  it("deactivates and reactivates via isActive", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createCustomer(app, cookies);

    const deactivated = await request(app)
      .patch(`/customers/${id}`)
      .set("Cookie", cookies)
      .send({ isActive: false });
    expect(deactivated.body.customer.isActive).toBe(false);

    const reactivated = await request(app).patch(`/customers/${id}`).set("Cookie", cookies).send({ isActive: true });
    expect(reactivated.body.customer.isActive).toBe(true);
  });

  it("rejects an empty body with 400", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createCustomer(app, cookies);

    const res = await request(app).patch(`/customers/${id}`).set("Cookie", cookies).send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 for a customer belonging to a different business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createCustomer(app, cookies);

    const otherRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).patch(`/customers/${id}`).set("Cookie", otherCookies).send({ phone: "123" });
    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).patch("/customers/x").send({ phone: "123" });
    expect(res.status).toBe(401);
  });
});
