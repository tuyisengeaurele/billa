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
    await prisma.user.update({ where: { id: res.body.user.id }, data: { isAdmin: true, totpEnabled: true } });
  }
  return {
    cookies: res.headers["set-cookie"] as unknown as string[],
    userId: res.body.user.id as string,
  };
}

describe("POST /admin/admins", () => {
  it("creates a pending admin with no business or real trial, and logs it", async () => {
    const app = createApp();
    const { cookies: adminCookies, userId: adminId } = await registerAndGetCookies(app, "admin@example.com", true);

    const res = await request(app)
      .post("/admin/admins")
      .set("Cookie", adminCookies)
      .send({ email: "new-admin@example.com" });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "new-admin@example.com", isAdmin: true });

    const created = await prisma.user.findUniqueOrThrow({ where: { email: "new-admin@example.com" } });
    expect(created.isAdmin).toBe(true);
    expect(created.firebaseUid).toMatch(/^pending:/);

    const rows = await prisma.adminAuditLogEntry.findMany({ where: { targetId: created.id } });
    expect(rows[0].action).toBe("ADMIN_INVITED");
    expect(rows[0].adminUserId).toBe(adminId);
  });

  it("lets that pending admin sign in and reach the admin area with no business, no trial setup", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    await request(app).post("/admin/admins").set("Cookie", adminCookies).send({ email: "new-admin@example.com" });

    const res = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "firebase-uid-for-new-admin", email: "new-admin@example.com" }),
    });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: "new-admin@example.com", isAdmin: true });
    expect(res.body.business).toBeNull();

    const linked = await prisma.user.findUniqueOrThrow({ where: { email: "new-admin@example.com" } });
    expect(linked.firebaseUid).toBe("firebase-uid-for-new-admin");
  });

  it("rejects an email that's already a registered account", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app)
      .post("/admin/admins")
      .set("Cookie", adminCookies)
      .send({ email: "owner@example.com" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("email_taken");
  });

  it("rejects an email that's already an admin", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);

    const res = await request(app)
      .post("/admin/admins")
      .set("Cookie", adminCookies)
      .send({ email: "admin@example.com" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("already_admin");
  });

  it("rejects an invalid email", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);

    const res = await request(app).post("/admin/admins").set("Cookie", adminCookies).send({ email: "not-an-email" });

    expect(res.status).toBe(400);
  });

  it("returns 403 for a non-admin", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app)
      .post("/admin/admins")
      .set("Cookie", cookies)
      .send({ email: "new-admin@example.com" });

    expect(res.status).toBe(403);
  });
});
