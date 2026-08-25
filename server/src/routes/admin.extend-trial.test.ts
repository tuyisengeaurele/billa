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

async function registerAndGetCookies(app: ReturnType<typeof createApp>, email: string, isAdmin = false) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: email, email }),
    businessName: "Kigali Traders",
  });
  if (isAdmin) {
    await prisma.user.update({ where: { id: res.body.user.id }, data: { isAdmin: true } });
  }
  return {
    cookies: res.headers["set-cookie"] as unknown as string[],
    userId: res.body.user.id as string,
  };
}

describe("POST /admin/users/:id/extend-trial", () => {
  it("extends an active trial by the given number of days", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    const { userId } = await registerAndGetCookies(app, "owner@example.com");
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const res = await request(app).post(`/admin/users/${userId}/extend-trial`).set("Cookie", adminCookies).send({
      days: 14,
    });

    expect(res.status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const expected = before.trialEndsAt.getTime() + 14 * 24 * 60 * 60 * 1000;
    expect(after.trialEndsAt.getTime()).toBe(expected);
  });

  it("extends from today when the trial has already lapsed", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    const { userId } = await registerAndGetCookies(app, "owner@example.com");
    await prisma.user.update({ where: { id: userId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });

    await request(app).post(`/admin/users/${userId}/extend-trial`).set("Cookie", adminCookies).send({ days: 14 });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const expectedMin = Date.now() + 13 * 24 * 60 * 60 * 1000;
    expect(after.trialEndsAt.getTime()).toBeGreaterThan(expectedMin);
  });

  it("logs TRIAL_EXTENDED", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    const { userId } = await registerAndGetCookies(app, "owner@example.com");

    await request(app).post(`/admin/users/${userId}/extend-trial`).set("Cookie", adminCookies).send({ days: 14 });

    const rows = await prisma.adminAuditLogEntry.findMany({ where: { targetId: userId } });
    expect(rows[0].action).toBe("TRIAL_EXTENDED");
    expect(rows[0].metadata).toMatchObject({ days: 14 });
  });

  it("rejects a non-positive number of days", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    const { userId } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).post(`/admin/users/${userId}/extend-trial`).set("Cookie", adminCookies).send({
      days: 0,
    });

    expect(res.status).toBe(400);
  });

  it("returns 403 for a non-admin", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).post(`/admin/users/${userId}/extend-trial`).set("Cookie", cookies).send({
      days: 14,
    });

    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown user", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);

    const res = await request(app).post("/admin/users/nonexistent/extend-trial").set("Cookie", adminCookies).send({
      days: 14,
    });

    expect(res.status).toBe(404);
  });
});
