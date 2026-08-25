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

async function registerAndGetCookies(app: ReturnType<typeof createApp>, email: string, businessName: string, isAdmin = false) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: email, email }),
    businessName,
  });
  if (isAdmin) {
    await prisma.user.update({ where: { id: res.body.user.id }, data: { isAdmin: true } });
  }
  return {
    cookies: res.headers["set-cookie"] as unknown as string[],
    userId: res.body.user.id as string,
  };
}

describe("POST /admin/users/:id/impersonate", () => {
  it("issues a session as the target user, embedding the admin's id, and logs the action", async () => {
    const app = createApp();
    const { cookies: adminCookies, userId: adminId } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { userId: targetId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");

    const res = await request(app).post(`/admin/users/${targetId}/impersonate`).set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    const impersonatedCookies = res.headers["set-cookie"] as unknown as string[];

    const meRes = await request(app).get("/auth/me").set("Cookie", impersonatedCookies);
    expect(meRes.body.user.email).toBe("owner@example.com");
    expect(meRes.body.impersonating).toBe(true);

    const rows = await prisma.adminAuditLogEntry.findMany({ where: { action: "IMPERSONATION_STARTED" } });
    expect(rows[0].adminUserId).toBe(adminId);
    expect(rows[0].targetId).toBe(targetId);
  });

  it("returns 400 when impersonating yourself", async () => {
    const app = createApp();
    const { cookies: adminCookies, userId: adminId } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);

    const res = await request(app).post(`/admin/users/${adminId}/impersonate`).set("Cookie", adminCookies);

    expect(res.status).toBe(400);
  });

  it("blocks stacking impersonation on top of a non-admin target with 403 (requireAdmin gate)", async () => {
    // While impersonating a non-admin, req.auth.userId is the target's id, so adminRouter's
    // router-level requireAdmin gate rejects any further /admin/* call — including a second
    // impersonate attempt — before the route's own already-impersonating check runs. That gate
    // is the actual anti-stacking protection for the common case; the route's 409 check only
    // matters if the impersonated target happens to be an admin themselves.
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { userId: target1 } = await registerAndGetCookies(app, "owner1@example.com", "Biz One");
    const { userId: target2 } = await registerAndGetCookies(app, "owner2@example.com", "Biz Two");
    const firstImpersonateRes = await request(app).post(`/admin/users/${target1}/impersonate`).set("Cookie", adminCookies);
    const impersonatedCookies = firstImpersonateRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).post(`/admin/users/${target2}/impersonate`).set("Cookie", impersonatedCookies);

    expect(res.status).toBe(403);
  });

  it("returns 409 when the impersonated target is themselves an admin and tries to impersonate again", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { userId: target1 } = await registerAndGetCookies(app, "owner1@example.com", "Biz One", true);
    const { userId: target2 } = await registerAndGetCookies(app, "owner2@example.com", "Biz Two");
    const firstImpersonateRes = await request(app).post(`/admin/users/${target1}/impersonate`).set("Cookie", adminCookies);
    const impersonatedCookies = firstImpersonateRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).post(`/admin/users/${target2}/impersonate`).set("Cookie", impersonatedCookies);

    expect(res.status).toBe(409);
  });

  it("returns 403 for a non-admin", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const { userId: targetId } = await registerAndGetCookies(app, "other@example.com", "Other Biz");

    const res = await request(app).post(`/admin/users/${targetId}/impersonate`).set("Cookie", cookies);

    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown user", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);

    const res = await request(app).post("/admin/users/nonexistent/impersonate").set("Cookie", adminCookies);

    expect(res.status).toBe(404);
  });
});

describe("POST /auth/impersonate/stop", () => {
  it("restores the admin's own session and logs the action", async () => {
    const app = createApp();
    const { cookies: adminCookies, userId: adminId } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { userId: targetId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const startRes = await request(app).post(`/admin/users/${targetId}/impersonate`).set("Cookie", adminCookies);
    const impersonatedCookies = startRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).post("/auth/impersonate/stop").set("Cookie", impersonatedCookies);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("admin@example.com");

    const restoredCookies = res.headers["set-cookie"] as unknown as string[];
    const meRes = await request(app).get("/auth/me").set("Cookie", restoredCookies);
    expect(meRes.body.user.email).toBe("admin@example.com");
    expect(meRes.body.impersonating).toBe(false);

    const rows = await prisma.adminAuditLogEntry.findMany({ where: { action: "IMPERSONATION_ENDED" } });
    expect(rows[0].adminUserId).toBe(adminId);
    expect(rows[0].targetId).toBe(targetId);
  });

  it("returns 400 when not currently impersonating", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");

    const res = await request(app).post("/auth/impersonate/stop").set("Cookie", cookies);

    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/auth/impersonate/stop");
    expect(res.status).toBe(401);
  });
});
