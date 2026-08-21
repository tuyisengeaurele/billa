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

function fakeIdToken(uid: string, email: string): string {
  return JSON.stringify({ uid, email });
}

describe("POST /auth/session", () => {
  it("creates a business and user on first sign-in with a businessName", async () => {
    const res = await request(createApp()).post("/auth/session").send({
      idToken: fakeIdToken("uid-1", "owner@example.com"),
      businessName: "Kigali Traders",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("owner@example.com");
    expect(res.body.business.name).toBe("Kigali Traders");

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("access_token="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("refresh_token="))).toBe(true);

    const user = await prisma.user.findUnique({ where: { firebaseUid: "uid-1" } });
    expect(user).not.toBeNull();
  });

  it("signs in an existing user on a repeat call with the same uid, without creating a duplicate", async () => {
    const app = createApp();
    await request(app).post("/auth/session").send({
      idToken: fakeIdToken("uid-1", "owner@example.com"),
      businessName: "Kigali Traders",
    });

    const res = await request(app).post("/auth/session").send({
      idToken: fakeIdToken("uid-1", "owner@example.com"),
    });

    expect(res.status).toBe(200);
    expect(res.body.business.name).toBe("Kigali Traders");

    const users = await prisma.user.findMany({ where: { firebaseUid: "uid-1" } });
    expect(users).toHaveLength(1);
  });

  it("returns 404 no_account for an unknown uid with no businessName", async () => {
    const res = await request(createApp()).post("/auth/session").send({
      idToken: fakeIdToken("uid-1", "owner@example.com"),
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("no_account");
  });

  it("returns 401 for an invalid token", async () => {
    const res = await request(createApp()).post("/auth/session").send({
      idToken: "not-json",
      businessName: "Kigali Traders",
    });

    expect(res.status).toBe(401);
  });

  it("rejects an invalid body with 400", async () => {
    const res = await request(createApp()).post("/auth/session").send({ businessName: "Kigali Traders" });
    expect(res.status).toBe(400);
  });

  it("sets a 14-day trial on a newly created business", async () => {
    const res = await request(createApp()).post("/auth/session").send({
      idToken: fakeIdToken("uid-1", "owner@example.com"),
      businessName: "Kigali Traders",
    });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: res.body.business.id } });
    const daysUntilTrialEnd = (business.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysUntilTrialEnd).toBeGreaterThan(13.9);
    expect(daysUntilTrialEnd).toBeLessThan(14.1);
  });
});
