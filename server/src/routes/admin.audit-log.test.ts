import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";
import { logAdminAction } from "../lib/admin-audit-log.js";

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

describe("GET /admin/audit-log", () => {
  it("returns entries newest first for an admin", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app, "admin@example.com", true);
    await logAdminAction({ adminUserId: userId, action: "TRIAL_EXTENDED", targetType: "User", targetId: "u1" });
    await logAdminAction({ adminUserId: userId, action: "ADMIN_GRANTED", targetType: "User", targetId: "u2" });

    const res = await request(app).get("/admin/audit-log").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.results[0].action).toBe("ADMIN_GRANTED");
    expect(res.body.results[0].admin.email).toBe("admin@example.com");
  });

  it("returns 403 for a non-admin", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", false);

    const res = await request(app).get("/admin/audit-log").set("Cookie", cookies);

    expect(res.status).toBe(403);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/admin/audit-log");
    expect(res.status).toBe(401);
  });
});
