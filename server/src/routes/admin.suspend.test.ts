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

describe("POST /admin/users/:id/suspend", () => {
  it("suspends the account, revokes refresh tokens, and logs the action", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    const { cookies: ownerCookies, userId } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).post(`/admin/users/${userId}/suspend`).set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(updated.suspendedAt).not.toBeNull();

    const refreshCookie = ownerCookies.find((c) => c.startsWith("refresh_token"));
    const refreshRes = await request(app).post("/auth/refresh").set("Cookie", [refreshCookie!]);
    expect(refreshRes.status).toBe(401);

    const rows = await prisma.adminAuditLogEntry.findMany({ where: { targetId: userId } });
    expect(rows[0].action).toBe("ACCOUNT_SUSPENDED");
  });

  it("blocks a suspended account from logging in", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    const { userId } = await registerAndGetCookies(app, "owner@example.com");
    await request(app).post(`/admin/users/${userId}/suspend`).set("Cookie", adminCookies);

    const loginRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.error).toBe("account_suspended");
  });

  it("blocks an admin from suspending themselves", async () => {
    const app = createApp();
    const { cookies: adminCookies, userId } = await registerAndGetCookies(app, "admin@example.com", true);

    const res = await request(app).post(`/admin/users/${userId}/suspend`).set("Cookie", adminCookies);

    expect(res.status).toBe(400);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.suspendedAt).toBeNull();
  });

  it("allows suspending a different admin", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    const { userId: otherAdminId } = await registerAndGetCookies(app, "other-admin@example.com", true);

    const res = await request(app).post(`/admin/users/${otherAdminId}/suspend`).set("Cookie", adminCookies);

    expect(res.status).toBe(200);
  });

  it("is idempotent when called twice", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    const { userId } = await registerAndGetCookies(app, "owner@example.com");
    await request(app).post(`/admin/users/${userId}/suspend`).set("Cookie", adminCookies);

    const res = await request(app).post(`/admin/users/${userId}/suspend`).set("Cookie", adminCookies);

    expect(res.status).toBe(200);
  });
});

describe("POST /admin/users/:id/reinstate", () => {
  it("clears the suspension and logs the action, and login works again", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    const { userId } = await registerAndGetCookies(app, "owner@example.com");
    await request(app).post(`/admin/users/${userId}/suspend`).set("Cookie", adminCookies);

    const res = await request(app).post(`/admin/users/${userId}/reinstate`).set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(updated.suspendedAt).toBeNull();

    const loginRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    });
    expect(loginRes.status).toBe(200);

    const rows = await prisma.adminAuditLogEntry.findMany({ where: { targetId: userId, action: "ACCOUNT_REINSTATED" } });
    expect(rows).toHaveLength(1);
  });
});
