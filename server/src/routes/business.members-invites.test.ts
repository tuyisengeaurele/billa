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

async function registerAndGetCookies(app: ReturnType<typeof createApp>, email: string, businessName: string) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: email, email }),
    businessName,
  });
  return { cookies: res.headers["set-cookie"] as unknown as string[], userId: res.body.user.id as string };
}

describe("POST /business/invites", () => {
  it("creates an invite, emails the invitee, and returns a shareable link", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const sendSpy = vi.spyOn(resendModule, "sendEmail").mockResolvedValue();

    const res = await request(app).post("/business/invites").set("Cookie", cookies).send({
      email: "friend@example.com",
    });

    expect(res.status).toBe(201);
    expect(res.body.invite.email).toBe("friend@example.com");
    expect(res.body.link).toContain("/invite/");
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ to: "friend@example.com" }));
  });

  it("still creates the invite when the email fails to send", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    vi.spyOn(resendModule, "sendEmail").mockRejectedValue(new Error("provider down"));

    const res = await request(app).post("/business/invites").set("Cookie", cookies).send({
      email: "friend@example.com",
    });

    expect(res.status).toBe(201);
  });

  it("rejects an invite for someone who is already a member", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", cookies);
    const { userId: memberId } = await registerAndGetCookies(app, "member@example.com", "Member's Own Biz");
    await prisma.businessMember.create({ data: { businessId: ownerRes.body.business.id, userId: memberId } });

    const res = await request(app).post("/business/invites").set("Cookie", cookies).send({
      email: "member@example.com",
    });

    expect(res.status).toBe(409);
  });

  it("blocks a member from creating an invite", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const { cookies: memberOwnCookies, userId: memberId } = await registerAndGetCookies(
      app,
      "member@example.com",
      "Member's Own Biz",
    );
    await prisma.businessMember.create({ data: { businessId: ownerRes.body.business.id, userId: memberId } });
    const switchRes = await request(app)
      .post("/auth/switch-business")
      .set("Cookie", memberOwnCookies)
      .send({ businessId: ownerRes.body.business.id });
    const memberCookies = switchRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).post("/business/invites").set("Cookie", memberCookies).send({
      email: "third@example.com",
    });

    expect(res.status).toBe(403);
  });

  it("logs MEMBER_INVITED", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", cookies);

    await request(app).post("/business/invites").set("Cookie", cookies).send({ email: "friend@example.com" });

    const rows = await prisma.activityLogEntry.findMany({
      where: { businessId: ownerRes.body.business.id, action: "MEMBER_INVITED" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ email: "friend@example.com" });
  });
});

describe("GET /business/members", () => {
  it("lists the owner and all members", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", cookies);
    const { userId: memberId } = await registerAndGetCookies(app, "member@example.com", "Member's Own Biz");
    await prisma.businessMember.create({ data: { businessId: ownerRes.body.business.id, userId: memberId } });

    const res = await request(app).get("/business/members").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.members).toEqual([
      expect.objectContaining({ email: "owner@example.com", role: "owner" }),
      expect.objectContaining({ email: "member@example.com", role: "member" }),
    ]);
  });
});

describe("DELETE /business/members/:userId", () => {
  it("removes a member", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", cookies);
    const { userId: memberId } = await registerAndGetCookies(app, "member@example.com", "Member's Own Biz");
    await prisma.businessMember.create({ data: { businessId: ownerRes.body.business.id, userId: memberId } });

    const res = await request(app).delete(`/business/members/${memberId}`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    const remaining = await prisma.businessMember.findMany({ where: { businessId: ownerRes.body.business.id } });
    expect(remaining).toHaveLength(0);
  });

  it("returns 404 for a member that isn't part of the business", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");

    const res = await request(app).delete("/business/members/nonexistent").set("Cookie", cookies);

    expect(res.status).toBe(404);
  });
});

describe("DELETE /business/invites/:id", () => {
  it("revokes a pending invite", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const createRes = await request(app).post("/business/invites").set("Cookie", cookies).send({
      email: "friend@example.com",
    });

    const res = await request(app).delete(`/business/invites/${createRes.body.invite.id}`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    const listRes = await request(app).get("/business/invites").set("Cookie", cookies);
    expect(listRes.body.invites).toHaveLength(0);
  });
});

describe("GET /business/invites", () => {
  it("includes a working link for each pending invite", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    await request(app).post("/business/invites").set("Cookie", cookies).send({ email: "friend@example.com" });

    const res = await request(app).get("/business/invites").set("Cookie", cookies);

    expect(res.body.invites[0].link).toContain("/invite/");
  });
});

describe("POST /business/invites/:id/resend", () => {
  it("extends the expiry, re-sends the email, and returns the link", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const createRes = await request(app).post("/business/invites").set("Cookie", cookies).send({
      email: "friend@example.com",
    });
    const original = await prisma.businessInvite.findUniqueOrThrow({ where: { id: createRes.body.invite.id } });
    await prisma.businessInvite.update({ where: { id: original.id }, data: { expiresAt: new Date(Date.now() + 1000) } });
    const sendSpy = vi.spyOn(resendModule, "sendEmail").mockResolvedValue();

    const res = await request(app).post(`/business/invites/${original.id}/resend`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.link).toContain("/invite/");
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ to: "friend@example.com" }));
    const updated = await prisma.businessInvite.findUniqueOrThrow({ where: { id: original.id } });
    expect(updated.expiresAt.getTime()).toBeGreaterThan(original.expiresAt.getTime());
  });

  it("returns 404 for an unknown invite", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");

    const res = await request(app).post("/business/invites/nonexistent/resend").set("Cookie", cookies);

    expect(res.status).toBe(404);
  });

  it("returns 404 for an already-accepted invite", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const createRes = await request(app).post("/business/invites").set("Cookie", ownerCookies).send({
      email: "friend@example.com",
    });
    const token = (createRes.body.link as string).split("/invite/")[1];
    const { cookies: inviteeCookies } = await registerAndGetCookies(app, "friend@example.com", "Friend's Own Biz");
    await request(app).post(`/invites/${token}/accept`).set("Cookie", inviteeCookies);

    const res = await request(app)
      .post(`/business/invites/${createRes.body.invite.id}/resend`)
      .set("Cookie", ownerCookies);

    expect(res.status).toBe(404);
  });

  it("blocks a member from resending an invite", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const createRes = await request(app).post("/business/invites").set("Cookie", ownerCookies).send({
      email: "friend@example.com",
    });
    const { cookies: memberOwnCookies, userId: memberId } = await registerAndGetCookies(
      app,
      "member@example.com",
      "Member's Own Biz",
    );
    await prisma.businessMember.create({ data: { businessId: ownerRes.body.business.id, userId: memberId } });
    const switchRes = await request(app)
      .post("/auth/switch-business")
      .set("Cookie", memberOwnCookies)
      .send({ businessId: ownerRes.body.business.id });
    const memberCookies = switchRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app)
      .post(`/business/invites/${createRes.body.invite.id}/resend`)
      .set("Cookie", memberCookies);

    expect(res.status).toBe(403);
  });
});

describe("invite accept flow", () => {
  it("shows invite preview details without requiring auth", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const createRes = await request(app).post("/business/invites").set("Cookie", cookies).send({
      email: "friend@example.com",
    });
    const token = (createRes.body.link as string).split("/invite/")[1];

    const res = await request(app).get(`/invites/${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      email: "friend@example.com",
      businessName: "Kigali Traders",
      expired: false,
      alreadyAccepted: false,
    });
  });

  it("returns 404 for an unknown token", async () => {
    const res = await request(createApp()).get("/invites/nonexistent-token");
    expect(res.status).toBe(404);
  });

  it("accepts the invite, adds the membership, and switches the session into the business", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const createRes = await request(app).post("/business/invites").set("Cookie", ownerCookies).send({
      email: "friend@example.com",
    });
    const token = (createRes.body.link as string).split("/invite/")[1];
    const { cookies: inviteeCookies, userId: inviteeId } = await registerAndGetCookies(
      app,
      "friend@example.com",
      "Friend's Own Biz",
    );

    const res = await request(app).post(`/invites/${token}/accept`).set("Cookie", inviteeCookies);

    expect(res.status).toBe(200);
    expect(res.body.business.name).toBe("Kigali Traders");
    expect(res.headers["set-cookie"]).toBeDefined();

    const membership = await prisma.businessMember.findFirst({ where: { userId: inviteeId } });
    expect(membership).not.toBeNull();

    const meRes = await request(app).get("/auth/me").set("Cookie", res.headers["set-cookie"] as unknown as string[]);
    expect(meRes.body.business.name).toBe("Kigali Traders");
  });

  it("rejects acceptance when the logged-in user's email doesn't match the invite", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const createRes = await request(app).post("/business/invites").set("Cookie", ownerCookies).send({
      email: "friend@example.com",
    });
    const token = (createRes.body.link as string).split("/invite/")[1];
    const { cookies: strangerCookies } = await registerAndGetCookies(app, "stranger@example.com", "Stranger Co");

    const res = await request(app).post(`/invites/${token}/accept`).set("Cookie", strangerCookies);

    expect(res.status).toBe(403);
  });

  it("rejects acceptance without a session", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const createRes = await request(app).post("/business/invites").set("Cookie", cookies).send({
      email: "friend@example.com",
    });
    const token = (createRes.body.link as string).split("/invite/")[1];

    const res = await request(app).post(`/invites/${token}/accept`);

    expect(res.status).toBe(401);
  });

  it("rejects acceptance of an already-accepted invite", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const createRes = await request(app).post("/business/invites").set("Cookie", ownerCookies).send({
      email: "friend@example.com",
    });
    const token = (createRes.body.link as string).split("/invite/")[1];
    const { cookies: inviteeCookies } = await registerAndGetCookies(app, "friend@example.com", "Friend's Own Biz");
    await request(app).post(`/invites/${token}/accept`).set("Cookie", inviteeCookies);

    const res = await request(app).post(`/invites/${token}/accept`).set("Cookie", inviteeCookies);

    expect(res.status).toBe(409);
  });

  it("rejects an expired invite", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const createRes = await request(app).post("/business/invites").set("Cookie", ownerCookies).send({
      email: "friend@example.com",
    });
    const token = (createRes.body.link as string).split("/invite/")[1];
    await prisma.businessInvite.update({ where: { id: createRes.body.invite.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const { cookies: inviteeCookies } = await registerAndGetCookies(app, "friend@example.com", "Friend's Own Biz");

    const res = await request(app).post(`/invites/${token}/accept`).set("Cookie", inviteeCookies);

    expect(res.status).toBe(410);
  });

  it("logs MEMBER_JOINED on acceptance", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const createRes = await request(app).post("/business/invites").set("Cookie", ownerCookies).send({
      email: "friend@example.com",
    });
    const token = (createRes.body.link as string).split("/invite/")[1];
    const { cookies: inviteeCookies } = await registerAndGetCookies(app, "friend@example.com", "Friend's Own Biz");

    await request(app).post(`/invites/${token}/accept`).set("Cookie", inviteeCookies);

    const rows = await prisma.activityLogEntry.findMany({
      where: { businessId: ownerRes.body.business.id, action: "MEMBER_JOINED" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ email: "friend@example.com" });
  });

  it("notifies the owner in-app when a member joins", async () => {
    const app = createApp();
    const { cookies: ownerCookies, userId: ownerId } = await registerAndGetCookies(
      app,
      "owner@example.com",
      "Kigali Traders",
    );
    const createRes = await request(app).post("/business/invites").set("Cookie", ownerCookies).send({
      email: "friend@example.com",
    });
    const token = (createRes.body.link as string).split("/invite/")[1];
    const { cookies: inviteeCookies } = await registerAndGetCookies(app, "friend@example.com", "Friend's Own Biz");

    await request(app).post(`/invites/${token}/accept`).set("Cookie", inviteeCookies);

    const notifications = await prisma.notification.findMany({ where: { userId: ownerId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ type: "MEMBER_JOINED", title: "friend@example.com joined your team" });
  });
});
