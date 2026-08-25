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
    businessId: res.body.business.id as string,
  };
}

describe("DELETE /auth/me", () => {
  it("deletes the caller's account and their owned business, then clears the session", async () => {
    const app = createApp();
    const { cookies, userId, businessId } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).delete("/auth/me").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
    expect(await prisma.business.findUnique({ where: { id: businessId } })).toBeNull();

    const cookieHeader = res.headers["set-cookie"] as unknown as string[];
    expect(cookieHeader.some((c) => c.startsWith("access_token=;"))).toBe(true);
  });

  it("removes only the membership for a member who doesn't own the business", async () => {
    const app = createApp();
    const { cookies: ownerCookies, businessId } = await registerAndGetCookies(app, "owner@example.com");
    const inviteRes = await request(app)
      .post("/business/invites")
      .set("Cookie", ownerCookies)
      .send({ email: "member@example.com" });
    const { cookies: memberCookies, userId: memberId } = await registerAndGetCookies(app, "member@example.com");
    await request(app).post(`/invites/${inviteRes.body.invite.token}/accept`).set("Cookie", memberCookies);

    const res = await request(app).delete("/auth/me").set("Cookie", memberCookies);

    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: memberId } })).toBeNull();
    expect(await prisma.business.findUnique({ where: { id: businessId } })).not.toBeNull();
  });

  it("returns 409 when the account has an admin action history", async () => {
    const app = createApp();
    const { cookies: adminCookies, userId: adminId } = await registerAndGetCookies(app, "admin@example.com", true);
    const { userId: targetId } = await registerAndGetCookies(app, "target@example.com");
    await request(app).post(`/admin/users/${targetId}/toggle-admin`).set("Cookie", adminCookies);
    void adminId;

    const res = await request(app).delete("/auth/me").set("Cookie", adminCookies);

    expect(res.status).toBe(409);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).delete("/auth/me");
    expect(res.status).toBe(401);
  });
});
