import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
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
    expect(res.body.user).toHaveProperty("phone");
    expect(res.body.business.name).toBe("Kigali Traders");
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns business: null for an admin-only account, without treating it as an expired session", async () => {
    const app = createApp();
    await prisma.user.create({
      data: {
        email: "admin-only@example.com",
        firebaseUid: "uid-admin-only",
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        isAdmin: true,
      },
    });
    const loginRes = await request(app)
      .post("/auth/session")
      .send({ idToken: JSON.stringify({ uid: "uid-admin-only", email: "admin-only@example.com" }) });
    const cookies = loginRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).get("/auth/me").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.user.isAdmin).toBe(true);
    expect(res.body.business).toBeNull();
  });
});
