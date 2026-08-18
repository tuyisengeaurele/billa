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

describe("GET /business", () => {
  it("returns the business profile for the authenticated user", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).get("/business").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.business.name).toBe("Kigali Traders");
    expect(res.body.business.tin).toBeNull();
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/business");
    expect(res.status).toBe(401);
  });
});
