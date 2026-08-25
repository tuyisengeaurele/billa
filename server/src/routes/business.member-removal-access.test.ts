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

async function registerAndGetCookies(app: ReturnType<typeof createApp>, email: string, businessName: string) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: email, email }),
    businessName,
  });
  return { cookies: res.headers["set-cookie"] as unknown as string[], userId: res.body.user.id as string };
}

describe("removing a member revokes their access", () => {
  it("revokes the removed member's refresh tokens for that business", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const businessId = ownerRes.body.business.id as string;
    const { cookies: memberCookies, userId: memberId } = await registerAndGetCookies(
      app,
      "member@example.com",
      "Member's Own Biz",
    );
    await prisma.businessMember.create({ data: { businessId, userId: memberId } });
    const switchRes = await request(app).post("/auth/switch-business").set("Cookie", memberCookies).send({ businessId });
    const memberBusinessCookies = switchRes.headers["set-cookie"] as unknown as string[];

    await request(app).delete(`/business/members/${memberId}`).set("Cookie", ownerCookies);

    const refreshCookie = memberBusinessCookies.find((c) => c.startsWith("refresh_token"));
    const refreshRes = await request(app).post("/auth/refresh").set("Cookie", [refreshCookie!]);
    expect(refreshRes.status).toBe(401);
  });

  it("clears lastActiveBusinessId when it pointed at the business the member was removed from", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const businessId = ownerRes.body.business.id as string;
    const { cookies: memberCookies, userId: memberId } = await registerAndGetCookies(
      app,
      "member@example.com",
      "Member's Own Biz",
    );
    await prisma.businessMember.create({ data: { businessId, userId: memberId } });
    await request(app).post("/auth/switch-business").set("Cookie", memberCookies).send({ businessId });

    await request(app).delete(`/business/members/${memberId}`).set("Cookie", ownerCookies);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
    expect(user.lastActiveBusinessId).not.toBe(businessId);
  });

  it("a fresh login for the removed member falls back to their own business instead of the one they lost access to", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const businessId = ownerRes.body.business.id as string;
    const { cookies: memberCookies, userId: memberId } = await registerAndGetCookies(
      app,
      "member@example.com",
      "Member's Own Biz",
    );
    await prisma.businessMember.create({ data: { businessId, userId: memberId } });
    await request(app).post("/auth/switch-business").set("Cookie", memberCookies).send({ businessId });
    await request(app).delete(`/business/members/${memberId}`).set("Cookie", ownerCookies);

    const loginRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "member@example.com", email: "member@example.com" }),
    });

    expect(loginRes.body.business.name).toBe("Member's Own Biz");
  });

  it("leaves lastActiveBusinessId and refresh tokens alone when they point at a different business", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const businessId = ownerRes.body.business.id as string;
    const { userId: memberId } = await registerAndGetCookies(app, "member@example.com", "Member's Own Biz");
    await prisma.businessMember.create({ data: { businessId, userId: memberId } });

    await request(app).delete(`/business/members/${memberId}`).set("Cookie", ownerCookies);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
    const ownBusiness = await prisma.business.findFirstOrThrow({ where: { ownerId: memberId } });
    expect(user.lastActiveBusinessId).toBe(ownBusiness.id);
  });
});
