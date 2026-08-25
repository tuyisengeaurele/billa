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
  return { cookies: res.headers["set-cookie"] as unknown as string[], userId: res.body.user.id as string };
}

describe("GET /admin/users/:id/sessions", () => {
  it("lists active sessions for a user", async () => {
    const app = createApp();
    const { cookies: adminCookies, userId: adminId } = await registerAndGetCookies(app, "admin@example.com", true);
    const { userId: targetId } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).get(`/admin/users/${targetId}/sessions`).set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0]).not.toHaveProperty("tokenHash");
    expect(res.body.results[0]).toHaveProperty("createdAt");
    expect(res.body.results[0]).toHaveProperty("expiresAt");

    const rows = await prisma.adminAuditLogEntry.findMany({ where: { adminUserId: adminId } });
    expect(rows).toHaveLength(0);
  });

  it("excludes revoked sessions", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    const { userId: targetId } = await registerAndGetCookies(app, "owner@example.com");
    await prisma.refreshToken.updateMany({ where: { userId: targetId }, data: { revokedAt: new Date() } });

    const res = await request(app).get(`/admin/users/${targetId}/sessions`).set("Cookie", adminCookies);

    expect(res.body.results).toHaveLength(0);
  });

  it("returns 403 for a non-admin", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).get(`/admin/users/${userId}/sessions`).set("Cookie", cookies);

    expect(res.status).toBe(403);
  });
});

describe("POST /admin/users/:id/sessions/:sessionId/revoke", () => {
  it("revokes the given session and logs the action", async () => {
    const app = createApp();
    const { cookies: adminCookies, userId: adminId } = await registerAndGetCookies(app, "admin@example.com", true);
    const { userId: targetId } = await registerAndGetCookies(app, "owner@example.com");
    const session = await prisma.refreshToken.findFirstOrThrow({ where: { userId: targetId } });

    const res = await request(app)
      .post(`/admin/users/${targetId}/sessions/${session.id}/revoke`)
      .set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    const updated = await prisma.refreshToken.findUniqueOrThrow({ where: { id: session.id } });
    expect(updated.revokedAt).not.toBeNull();

    const rows = await prisma.adminAuditLogEntry.findMany({ where: { action: "SESSION_REVOKED" } });
    expect(rows[0]).toMatchObject({ adminUserId: adminId, targetType: "User", targetId });
  });

  it("returns 404 when the session doesn't belong to the given user", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    const { userId: targetId } = await registerAndGetCookies(app, "owner@example.com");
    const { userId: otherId } = await registerAndGetCookies(app, "other@example.com");
    const otherSession = await prisma.refreshToken.findFirstOrThrow({ where: { userId: otherId } });

    const res = await request(app)
      .post(`/admin/users/${targetId}/sessions/${otherSession.id}/revoke`)
      .set("Cookie", adminCookies);

    expect(res.status).toBe(404);
  });

  it("returns 403 for a non-admin", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app, "owner@example.com");
    const session = await prisma.refreshToken.findFirstOrThrow({ where: { userId } });

    const res = await request(app).post(`/admin/users/${userId}/sessions/${session.id}/revoke`).set("Cookie", cookies);

    expect(res.status).toBe(403);
  });
});
