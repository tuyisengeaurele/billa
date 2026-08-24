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

describe("PATCH /business", () => {
  it("updates the provided fields and leaves others untouched", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .patch("/business")
      .set("Cookie", cookies)
      .send({ tin: "123456789", phone: "+250788000000" });

    expect(res.status).toBe(200);
    expect(res.body.business.tin).toBe("123456789");
    expect(res.body.business.phone).toBe("+250788000000");
    expect(res.body.business.name).toBe("Kigali Traders");
  });

  it("clears a field when it's explicitly set to null", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await request(app).patch("/business").set("Cookie", cookies).send({ tin: "123456789" });

    const res = await request(app).patch("/business").set("Cookie", cookies).send({ tin: null });

    expect(res.status).toBe(200);
    expect(res.body.business.tin).toBeNull();
  });

  it("rejects an invalid email with 400", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).patch("/business").set("Cookie", cookies).send({ email: "not-an-email" });

    expect(res.status).toBe(400);
  });

  it("rejects an empty body with 400", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).patch("/business").set("Cookie", cookies).send({});

    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).patch("/business").send({ tin: "123456789" });
    expect(res.status).toBe(401);
  });
});
