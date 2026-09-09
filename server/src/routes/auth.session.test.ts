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

function fakeIdToken(uid: string, email: string): string {
  return JSON.stringify({ uid, email });
}

describe("POST /auth/session", () => {
  it("creates a business and user on first sign-in with a businessName", async () => {
    const res = await request(createApp()).post("/auth/session").send({
      idToken: fakeIdToken("uid-1", "owner@example.com"),
      businessName: "Kigali Traders",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("owner@example.com");
    expect(res.body.business.name).toBe("Kigali Traders");

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("access_token="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("refresh_token="))).toBe(true);

    const user = await prisma.user.findUnique({ where: { firebaseUid: "uid-1" } });
    expect(user).not.toBeNull();
  });

  it("signs in an existing user on a repeat call with the same uid, without creating a duplicate", async () => {
    const app = createApp();
    await request(app).post("/auth/session").send({
      idToken: fakeIdToken("uid-1", "owner@example.com"),
      businessName: "Kigali Traders",
    });

    const res = await request(app).post("/auth/session").send({
      idToken: fakeIdToken("uid-1", "owner@example.com"),
    });

    expect(res.status).toBe(200);
    expect(res.body.business.name).toBe("Kigali Traders");

    const users = await prisma.user.findMany({ where: { firebaseUid: "uid-1" } });
    expect(users).toHaveLength(1);
  });

  it("returns 404 no_account for an unknown uid with no businessName", async () => {
    const res = await request(createApp()).post("/auth/session").send({
      idToken: fakeIdToken("uid-1", "owner@example.com"),
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("no_account");
  });

  it("returns 403 no_business_access instead of crashing, for an account that owns no business at all", async () => {
    // Regression test: an admin-only account (promoted via direct DB edit, never
    // went through the normal "create your own business" registration) or any
    // account that has left every business it belonged to hits this - the old
    // findFirstOrThrow/findUniqueOrThrow pair threw an unhandled exception here,
    // turning login itself into a 500 instead of a clear, recoverable response.
    await prisma.user.create({
      data: {
        email: "admin-only@example.com",
        firebaseUid: "uid-admin-only",
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        isAdmin: true,
      },
    });

    const res = await request(createApp())
      .post("/auth/session")
      .send({ idToken: fakeIdToken("uid-admin-only", "admin-only@example.com") });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "no_business_access" });
  });

  it("returns 401 for an invalid token", async () => {
    const res = await request(createApp()).post("/auth/session").send({
      idToken: "not-json",
      businessName: "Kigali Traders",
    });

    expect(res.status).toBe(401);
  });

  it("rejects an invalid body with 400", async () => {
    const res = await request(createApp()).post("/auth/session").send({ businessName: "Kigali Traders" });
    expect(res.status).toBe(400);
  });

  it("sets a 14-day trial on a newly created account", async () => {
    const res = await request(createApp()).post("/auth/session").send({
      idToken: fakeIdToken("uid-1", "owner@example.com"),
      businessName: "Kigali Traders",
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.body.user.id } });
    const daysUntilTrialEnd = (user.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysUntilTrialEnd).toBeGreaterThan(13.9);
    expect(daysUntilTrialEnd).toBeLessThan(14.1);
  });

  it("signs in to the account's last active business when it owns more than one", async () => {
    const app = createApp();
    const firstRes = await request(app).post("/auth/session").send({
      idToken: fakeIdToken("uid-1", "owner@example.com"),
      businessName: "Kigali Traders",
    });
    const userId = firstRes.body.user.id as string;
    const secondBusiness = await prisma.business.create({ data: { name: "Side Hustle", ownerId: userId } });
    await prisma.user.update({ where: { id: userId }, data: { lastActiveBusinessId: secondBusiness.id } });

    const res = await request(app).post("/auth/session").send({ idToken: fakeIdToken("uid-1", "owner@example.com") });

    expect(res.body.business.name).toBe("Side Hustle");
  });

  describe("registering with an inviteToken", () => {
    async function createOwnerAndInvite(app: ReturnType<typeof createApp>) {
      const ownerRes = await request(app).post("/auth/session").send({
        idToken: fakeIdToken("owner-uid", "owner@example.com"),
        businessName: "Kigali Traders",
      });
      const ownerCookies = ownerRes.headers["set-cookie"] as unknown as string[];
      const inviteRes = await request(app)
        .post("/business/invites")
        .set("Cookie", ownerCookies)
        .send({ email: "friend@example.com" });
      const token = (inviteRes.body.link as string).split("/invite/")[1];
      return { token, businessId: ownerRes.body.business.id as string };
    }

    it("joins the invited business directly, without creating a placeholder business", async () => {
      const app = createApp();
      const { token, businessId } = await createOwnerAndInvite(app);

      const res = await request(app).post("/auth/session").send({
        idToken: fakeIdToken("friend-uid", "friend@example.com"),
        inviteToken: token,
      });

      expect(res.status).toBe(201);
      expect(res.body.business.id).toBe(businessId);
      expect(res.body.business.name).toBe("Kigali Traders");

      const user = await prisma.user.findUniqueOrThrow({ where: { firebaseUid: "friend-uid" } });
      const ownedBusinesses = await prisma.business.count({ where: { ownerId: user.id } });
      expect(ownedBusinesses).toBe(0);

      const membership = await prisma.businessMember.findUnique({
        where: { businessId_userId: { businessId, userId: user.id } },
      });
      expect(membership).not.toBeNull();
    });

    it("does not leave a dangling account behind when the invite can't be accepted", async () => {
      const app = createApp();
      const { token } = await createOwnerAndInvite(app);

      const res = await request(app).post("/auth/session").send({
        // Registers with a different email than the invite was sent to.
        idToken: fakeIdToken("someone-else-uid", "someone-else@example.com"),
        inviteToken: token,
      });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("email_mismatch");

      const user = await prisma.user.findUnique({ where: { firebaseUid: "someone-else-uid" } });
      expect(user).toBeNull();
    });
  });
});
