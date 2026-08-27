import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";
import * as resendModule from "../lib/resend.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

beforeEach(() => {
  vi.spyOn(resendModule, "sendEmail").mockResolvedValue();
});

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

async function inviteAndAcceptMember(
  app: ReturnType<typeof createApp>,
  ownerCookies: string[],
  memberEmail: string,
) {
  await request(app).post("/business/invites").set("Cookie", ownerCookies).send({ email: memberEmail });
  const invite = await prisma.businessInvite.findFirstOrThrow({ where: { email: memberEmail } });

  const memberSession = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: memberEmail, email: memberEmail }),
    businessName: "Member's Own Biz",
  });
  const registeredCookies = memberSession.headers["set-cookie"] as unknown as string[];

  const acceptRes = await request(app).post(`/invites/${invite.token}/accept`).set("Cookie", registeredCookies);
  return {
    memberId: memberSession.body.user.id as string,
    memberCookies: acceptRes.headers["set-cookie"] as unknown as string[],
  };
}

async function impersonate(app: ReturnType<typeof createApp>, requesterCookies: string[], targetUserId: string) {
  const created = await request(app)
    .post("/impersonation-requests")
    .set("Cookie", requesterCookies)
    .send({ targetUserId });
  return created.body.request.id as string;
}

describe("POST /auth/impersonate/stop", () => {
  it("restores the admin's own session and logs an admin audit entry", async () => {
    const app = createApp();
    const { cookies: adminCookies, userId: adminId } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { cookies: targetCookies, userId: targetId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");

    const requestId = await impersonate(app, adminCookies, targetId);
    await request(app).post(`/impersonation-requests/${requestId}/approve`).set("Cookie", targetCookies);
    const redeemRes = await request(app).post(`/impersonation-requests/${requestId}/redeem`).set("Cookie", adminCookies);
    const impersonatedCookies = redeemRes.headers["set-cookie"] as unknown as string[];

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

  it("restores an owner's own session and logs a business activity entry, not an admin audit entry", async () => {
    const app = createApp();
    const { cookies: ownerCookies, userId: ownerId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const { memberId, memberCookies } = await inviteAndAcceptMember(app, ownerCookies, "member@example.com");

    const requestId = await impersonate(app, ownerCookies, memberId);
    await request(app).post(`/impersonation-requests/${requestId}/approve`).set("Cookie", memberCookies);
    const redeemRes = await request(app).post(`/impersonation-requests/${requestId}/redeem`).set("Cookie", ownerCookies);
    const impersonatedCookies = redeemRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).post("/auth/impersonate/stop").set("Cookie", impersonatedCookies);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("owner@example.com");

    const adminRows = await prisma.adminAuditLogEntry.findMany();
    expect(adminRows).toHaveLength(0);

    const activityRows = await prisma.activityLogEntry.findMany({ where: { action: "MEMBER_IMPERSONATION_ENDED" } });
    expect(activityRows).toHaveLength(1);
    expect(activityRows[0].actorUserId).toBe(ownerId);
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
