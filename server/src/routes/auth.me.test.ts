import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

describe("GET /auth/me", () => {
  it("returns the current user and business when authenticated", async () => {
    const app = createApp();
    const registerRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
      businessName: "Kigali Traders",
    });
    const cookies = registerRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).get("/auth/me").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("owner@example.com");
    expect(res.body.business.name).toBe("Kigali Traders");
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/auth/me");
    expect(res.status).toBe(401);
  });
});
