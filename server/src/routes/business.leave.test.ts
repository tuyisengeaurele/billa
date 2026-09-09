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

describe("POST /business/leave", () => {
  it("removes the member's own membership and switches them into their other business", async () => {
    const app = createApp();
    const { userId: ownerId, cookies: ownerCookies } = await registerAndGetCookies(
      app,
      "owner@example.com",
      "Kigali Traders",
    );
    const { userId: memberId, cookies: memberCookies } = await registerAndGetCookies(
      app,
      "member@example.com",
      "My Own Shop",
    );
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const teamBusinessId = ownerRes.body.business.id as string;
    await prisma.businessMember.create({ data: { businessId: teamBusinessId, userId: memberId } });
    // Switch the member into the team business so req.auth.businessId points there.
    const switched = await request(app)
      .post("/auth/switch-business")
      .set("Cookie", memberCookies)
      .send({ businessId: teamBusinessId });
    const inTeamCookies = switched.headers["set-cookie"] as unknown as string[];

    const res = await request(app).post("/business/leave").set("Cookie", inTeamCookies);

    expect(res.status).toBe(200);
    expect(res.body.business.name).toBe("My Own Shop");
    expect(res.body.createdReplacement).toBe(false);

    const membership = await prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId: teamBusinessId, userId: memberId } },
    });
    expect(membership).toBeNull();
  });

  it("creates a fresh business instead of leaving the account with nowhere to land", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const { userId: memberId, cookies: memberCookies } = await registerAndGetCookies(
      app,
      "member@example.com",
      "My Own Shop",
    );
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const teamBusinessId = ownerRes.body.business.id as string;
    // The member owns no business of their own in this scenario.
    await prisma.business.deleteMany({ where: { ownerId: memberId } });
    await prisma.businessMember.create({ data: { businessId: teamBusinessId, userId: memberId } });
    const switched = await request(app)
      .post("/auth/switch-business")
      .set("Cookie", memberCookies)
      .send({ businessId: teamBusinessId });
    const inTeamCookies = switched.headers["set-cookie"] as unknown as string[];

    const res = await request(app).post("/business/leave").set("Cookie", inTeamCookies);

    expect(res.status).toBe(200);
    expect(res.body.createdReplacement).toBe(true);
    expect(res.body.business.name).toBe("My Business");

    const newBusiness = await prisma.business.findFirst({ where: { ownerId: memberId } });
    expect(newBusiness).not.toBeNull();
  });

  it("revokes the leaving member's refresh tokens for that business", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const { userId: memberId, cookies: memberCookies } = await registerAndGetCookies(
      app,
      "member@example.com",
      "My Own Shop",
    );
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const teamBusinessId = ownerRes.body.business.id as string;
    await prisma.businessMember.create({ data: { businessId: teamBusinessId, userId: memberId } });
    const switched = await request(app)
      .post("/auth/switch-business")
      .set("Cookie", memberCookies)
      .send({ businessId: teamBusinessId });
    const inTeamCookies = switched.headers["set-cookie"] as unknown as string[];

    await request(app).post("/business/leave").set("Cookie", inTeamCookies);

    const activeTokens = await prisma.refreshToken.findMany({
      where: { userId: memberId, businessId: teamBusinessId, revokedAt: null },
    });
    expect(activeTokens).toHaveLength(0);
  });

  it("refuses to let the owner leave their own business", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");

    const res = await request(app).post("/business/leave").set("Cookie", cookies);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("owner_cannot_leave");
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/business/leave");
    expect(res.status).toBe(401);
  });
});
