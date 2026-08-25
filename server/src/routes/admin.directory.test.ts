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
    businessId: res.body.business.id as string,
  };
}

describe("GET /admin/users", () => {
  it("lists users, filterable by search", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    await registerAndGetCookies(app, "someone@acme.com", "Acme");

    const res = await request(app).get("/admin/users?search=acme").set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].email).toBe("someone@acme.com");
  });

  it("returns 403 for a non-admin", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");

    const res = await request(app).get("/admin/users").set("Cookie", cookies);

    expect(res.status).toBe(403);
  });
});

describe("GET /admin/users/:id", () => {
  it("returns a user's owned and member businesses", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { userId, businessId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const { cookies: memberOwnCookies, userId: memberId } = await registerAndGetCookies(
      app,
      "member@example.com",
      "Member's Own Biz",
    );
    await prisma.businessMember.create({ data: { businessId, userId: memberId } });
    void memberOwnCookies;

    const res = await request(app).get(`/admin/users/${userId}`).set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("owner@example.com");
    expect(res.body.ownedBusinesses).toEqual([expect.objectContaining({ id: businessId, name: "Kigali Traders" })]);

    const memberRes = await request(app).get(`/admin/users/${memberId}`).set("Cookie", adminCookies);
    expect(memberRes.body.memberBusinesses).toEqual([expect.objectContaining({ id: businessId })]);
  });

  it("returns 404 for an unknown user", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);

    const res = await request(app).get("/admin/users/nonexistent").set("Cookie", adminCookies);

    expect(res.status).toBe(404);
  });
});

describe("POST /admin/users/:id/toggle-admin", () => {
  it("grants admin and logs the action", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { userId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");

    const res = await request(app).post(`/admin/users/${userId}/toggle-admin`).set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    expect(res.body.user.isAdmin).toBe(true);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(updated.isAdmin).toBe(true);
    const logRows = await prisma.adminAuditLogEntry.findMany({ where: { targetId: userId } });
    expect(logRows[0].action).toBe("ADMIN_GRANTED");
  });

  it("revokes admin when called again", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { userId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders", true);

    const res = await request(app).post(`/admin/users/${userId}/toggle-admin`).set("Cookie", adminCookies);

    expect(res.body.user.isAdmin).toBe(false);
    const logRows = await prisma.adminAuditLogEntry.findMany({ where: { targetId: userId } });
    expect(logRows[0].action).toBe("ADMIN_REVOKED");
  });

  it("blocks an admin from revoking their own admin status", async () => {
    const app = createApp();
    const { cookies: adminCookies, userId } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);

    const res = await request(app).post(`/admin/users/${userId}/toggle-admin`).set("Cookie", adminCookies);

    expect(res.status).toBe(400);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(updated.isAdmin).toBe(true);
  });
});

describe("GET /admin/businesses", () => {
  it("lists businesses with owner email and counts, filterable by search", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");

    const res = await request(app).get("/admin/businesses?search=kigali").set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0]).toMatchObject({ name: "Kigali Traders", ownerEmail: "owner@example.com", memberCount: 0 });
  });

  it("returns 403 for a non-admin", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");

    const res = await request(app).get("/admin/businesses").set("Cookie", cookies);

    expect(res.status).toBe(403);
  });
});

describe("GET /admin/businesses/:id", () => {
  it("returns owner, members, and counts", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { businessId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const { userId: memberId } = await registerAndGetCookies(app, "member@example.com", "Member's Own Biz");
    await prisma.businessMember.create({ data: { businessId, userId: memberId } });

    const res = await request(app).get(`/admin/businesses/${businessId}`).set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    expect(res.body.business.owner.email).toBe("owner@example.com");
    expect(res.body.business.members).toEqual([expect.objectContaining({ email: "member@example.com" })]);
  });

  it("returns 404 for an unknown business", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);

    const res = await request(app).get("/admin/businesses/nonexistent").set("Cookie", adminCookies);

    expect(res.status).toBe(404);
  });
});
