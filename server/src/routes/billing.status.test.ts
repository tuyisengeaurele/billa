import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

describe("GET /billing/status", () => {
  it("returns trial info for a newly created business", async () => {
    const registerRes = await request(createApp()).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
      businessName: "Kigali Traders",
    });
    const cookies = registerRes.headers["set-cookie"] as unknown as string[];

    const statusRes = await request(createApp()).get("/billing/status").set("Cookie", cookies);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.plan).toBeNull();
    expect(statusRes.body.currentPeriodEnd).toBeNull();
    expect(new Date(statusRes.body.trialEndsAt).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(statusRes.body.activeUntil).getTime()).toBe(new Date(statusRes.body.trialEndsAt).getTime());
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/billing/status");
    expect(res.status).toBe(401);
  });
});
