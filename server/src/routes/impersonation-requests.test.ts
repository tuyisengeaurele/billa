import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";
import * as mailerModule from "../lib/mailer.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

beforeEach(() => {
  vi.spyOn(mailerModule, "sendEmail").mockResolvedValue();
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
    businessId: res.body.business.id as string,
  };
}

async function inviteAndAcceptMember(app: ReturnType<typeof createApp>, ownerCookies: string[], memberEmail: string) {
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

describe("POST /impersonation-requests", () => {
  it("lets an admin request to impersonate any user", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { userId: targetId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");

    const res = await request(app).post("/impersonation-requests").set("Cookie", adminCookies).send({ targetUserId: targetId });

    expect(res.status).toBe(201);
    expect(res.body.request.status).toBe("PENDING");
  });

  it("falls back to the target's first owned business when they have no lastActiveBusinessId", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { userId: targetId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    await prisma.user.update({ where: { id: targetId }, data: { lastActiveBusinessId: null } });

    const res = await request(app).post("/impersonation-requests").set("Cookie", adminCookies).send({ targetUserId: targetId });

    expect(res.status).toBe(201);
  });

  it("404s when the target has no business at all", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const target = await prisma.user.create({
      data: { email: "noBiz@example.com", firebaseUid: "noBiz", trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
    });

    const res = await request(app).post("/impersonation-requests").set("Cookie", adminCookies).send({ targetUserId: target.id });

    expect(res.status).toBe(404);
  });

  it("lets an owner request to impersonate their own member", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const { memberId } = await inviteAndAcceptMember(app, ownerCookies, "member@example.com");

    const res = await request(app).post("/impersonation-requests").set("Cookie", ownerCookies).send({ targetUserId: memberId });

    expect(res.status).toBe(201);
  });

  it("forbids an owner from requesting someone who isn't their member", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const { userId: strangerId } = await registerAndGetCookies(app, "stranger@example.com", "Stranger Co");

    const res = await request(app).post("/impersonation-requests").set("Cookie", ownerCookies).send({ targetUserId: strangerId });

    expect(res.status).toBe(403);
  });

  it("forbids a business member from requesting impersonation of anyone", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const { memberCookies } = await inviteAndAcceptMember(app, ownerCookies, "member@example.com");
    const { userId: otherMemberId } = await registerAndGetCookies(app, "other@example.com", "Other Co");

    const res = await request(app).post("/impersonation-requests").set("Cookie", memberCookies).send({ targetUserId: otherMemberId });

    expect(res.status).toBe(403);
  });

  it("rejects impersonating yourself", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");

    const res = await request(app).post("/impersonation-requests").set("Cookie", cookies).send({ targetUserId: userId });

    expect(res.status).toBe(400);
  });

  it("404s for an unknown target", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);

    const res = await request(app).post("/impersonation-requests").set("Cookie", cookies).send({ targetUserId: "does-not-exist" });

    expect(res.status).toBe(404);
  });

  it("rejects a second pending request from the same requester", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { userId: target1 } = await registerAndGetCookies(app, "owner1@example.com", "Biz One");
    const { userId: target2 } = await registerAndGetCookies(app, "owner2@example.com", "Biz Two");

    await request(app).post("/impersonation-requests").set("Cookie", adminCookies).send({ targetUserId: target1 });
    const res = await request(app).post("/impersonation-requests").set("Cookie", adminCookies).send({ targetUserId: target2 });

    expect(res.status).toBe(409);
  });
});

describe("GET /impersonation-requests/pending-for-me", () => {
  it("returns null when nothing is pending", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");

    const res = await request(app).get("/impersonation-requests/pending-for-me").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.request).toBeNull();
  });

  it("returns the pending request for the target", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { cookies: targetCookies, userId: targetId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    await request(app).post("/impersonation-requests").set("Cookie", adminCookies).send({ targetUserId: targetId, reason: "support ticket" });

    const res = await request(app).get("/impersonation-requests/pending-for-me").set("Cookie", targetCookies);

    expect(res.body.request.requesterName).toBe("admin@example.com");
    expect(res.body.request.reason).toBe("support ticket");
  });
});

describe("approve / deny", () => {
  it("lets only the target approve a pending request", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { cookies: targetCookies, userId: targetId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const created = await request(app).post("/impersonation-requests").set("Cookie", adminCookies).send({ targetUserId: targetId });
    const requestId = created.body.request.id;

    const wrongActor = await request(app).post(`/impersonation-requests/${requestId}/approve`).set("Cookie", adminCookies);
    expect(wrongActor.status).toBe(404);

    const approved = await request(app).post(`/impersonation-requests/${requestId}/approve`).set("Cookie", targetCookies);
    expect(approved.status).toBe(200);
  });

  it("rejects approving a request twice", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { cookies: targetCookies, userId: targetId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const created = await request(app).post("/impersonation-requests").set("Cookie", adminCookies).send({ targetUserId: targetId });
    const requestId = created.body.request.id;

    await request(app).post(`/impersonation-requests/${requestId}/approve`).set("Cookie", targetCookies);
    const res = await request(app).post(`/impersonation-requests/${requestId}/approve`).set("Cookie", targetCookies);

    expect(res.status).toBe(409);
  });

  it("lets the target deny a pending request", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { cookies: targetCookies, userId: targetId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const created = await request(app).post("/impersonation-requests").set("Cookie", adminCookies).send({ targetUserId: targetId });
    const requestId = created.body.request.id;

    const res = await request(app).post(`/impersonation-requests/${requestId}/deny`).set("Cookie", targetCookies);

    expect(res.status).toBe(200);
    const redeemAfterDeny = await request(app).post(`/impersonation-requests/${requestId}/redeem`).set("Cookie", adminCookies);
    expect(redeemAfterDeny.status).toBe(409);
  });

  it("rejects approving an expired request", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { cookies: targetCookies, userId: targetId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const created = await request(app).post("/impersonation-requests").set("Cookie", adminCookies).send({ targetUserId: targetId });
    const requestId = created.body.request.id;
    await prisma.impersonationRequest.update({ where: { id: requestId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).post(`/impersonation-requests/${requestId}/approve`).set("Cookie", targetCookies);

    expect(res.status).toBe(409);
  });
});

describe("GET /impersonation-requests/:id", () => {
  it("only lets the original requester poll status", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { cookies: targetCookies, userId: targetId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const created = await request(app).post("/impersonation-requests").set("Cookie", adminCookies).send({ targetUserId: targetId });
    const requestId = created.body.request.id;

    const asTarget = await request(app).get(`/impersonation-requests/${requestId}`).set("Cookie", targetCookies);
    expect(asTarget.status).toBe(404);

    const asRequester = await request(app).get(`/impersonation-requests/${requestId}`).set("Cookie", adminCookies);
    expect(asRequester.body.status).toBe("PENDING");
  });

  it("reports EXPIRED once the ttl has passed without a response", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { userId: targetId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const created = await request(app).post("/impersonation-requests").set("Cookie", adminCookies).send({ targetUserId: targetId });
    const requestId = created.body.request.id;
    await prisma.impersonationRequest.update({ where: { id: requestId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).get(`/impersonation-requests/${requestId}`).set("Cookie", adminCookies);

    expect(res.body.status).toBe("EXPIRED");
  });
});

describe("POST /impersonation-requests/:id/redeem", () => {
  it("issues a session only for the original requester, only once approved", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { cookies: targetCookies, userId: targetId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const created = await request(app).post("/impersonation-requests").set("Cookie", adminCookies).send({ targetUserId: targetId });
    const requestId = created.body.request.id;

    const tooSoon = await request(app).post(`/impersonation-requests/${requestId}/redeem`).set("Cookie", adminCookies);
    expect(tooSoon.status).toBe(409);

    await request(app).post(`/impersonation-requests/${requestId}/approve`).set("Cookie", targetCookies);

    const wrongActor = await request(app).post(`/impersonation-requests/${requestId}/redeem`).set("Cookie", targetCookies);
    expect(wrongActor.status).toBe(404);

    const redeemed = await request(app).post(`/impersonation-requests/${requestId}/redeem`).set("Cookie", adminCookies);
    expect(redeemed.status).toBe(200);
    const impersonatedCookies = redeemed.headers["set-cookie"] as unknown as string[];
    const meRes = await request(app).get("/auth/me").set("Cookie", impersonatedCookies);
    expect(meRes.body.user.email).toBe("owner@example.com");
    expect(meRes.body.impersonating).toBe(true);

    const again = await request(app).post(`/impersonation-requests/${requestId}/redeem`).set("Cookie", adminCookies);
    expect(again.status).toBe(409);
  });
});

describe("POST /impersonation-requests/:id/override", () => {
  it("lets the admin requester redeem an expired request with a reason", async () => {
    const app = createApp();
    const { cookies: adminCookies, userId: adminId } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { userId: targetId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const created = await request(app).post("/impersonation-requests").set("Cookie", adminCookies).send({ targetUserId: targetId });
    const requestId = created.body.request.id;
    await prisma.impersonationRequest.update({ where: { id: requestId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const missingReason = await request(app).post(`/impersonation-requests/${requestId}/override`).set("Cookie", adminCookies).send({});
    expect(missingReason.status).toBe(400);

    const res = await request(app)
      .post(`/impersonation-requests/${requestId}/override`)
      .set("Cookie", adminCookies)
      .send({ overrideReason: "Customer locked out, needs urgent access" });

    expect(res.status).toBe(200);
    const auditRows = await prisma.adminAuditLogEntry.findMany({ where: { action: "IMPERSONATION_OVERRIDDEN" } });
    expect(auditRows[0].adminUserId).toBe(adminId);
  });

  it("rejects override while the request is still pending", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", "Admin Co", true);
    const { userId: targetId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const created = await request(app).post("/impersonation-requests").set("Cookie", adminCookies).send({ targetUserId: targetId });
    const requestId = created.body.request.id;

    const res = await request(app)
      .post(`/impersonation-requests/${requestId}/override`)
      .set("Cookie", adminCookies)
      .send({ overrideReason: "trying too early" });

    expect(res.status).toBe(409);
  });

  it("is not available to a non-admin owner, even once the request has expired", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const { memberId } = await inviteAndAcceptMember(app, ownerCookies, "member@example.com");
    const created = await request(app).post("/impersonation-requests").set("Cookie", ownerCookies).send({ targetUserId: memberId });
    const requestId = created.body.request.id;
    await prisma.impersonationRequest.update({ where: { id: requestId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app)
      .post(`/impersonation-requests/${requestId}/override`)
      .set("Cookie", ownerCookies)
      .send({ overrideReason: "member is unreachable" });

    expect(res.status).toBe(403);
  });
});
