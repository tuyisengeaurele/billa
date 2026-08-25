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

describe("POST /auth/switch-business", () => {
  it("lets the owner switch into a business they own", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const second = await prisma.business.create({ data: { name: "Side Hustle", ownerId: userId } });

    const res = await request(app).post("/auth/switch-business").set("Cookie", cookies).send({
      businessId: second.id,
    });

    expect(res.status).toBe(200);
    expect(res.body.business.name).toBe("Side Hustle");
  });

  it("lets a member switch into a business they belong to", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const { cookies: memberCookies, userId: memberId } = await registerAndGetCookies(
      app,
      "member@example.com",
      "Member's Own Biz",
    );
    await prisma.businessMember.create({
      data: { businessId: ownerRes.body.business.id, userId: memberId },
    });

    const res = await request(app)
      .post("/auth/switch-business")
      .set("Cookie", memberCookies)
      .send({ businessId: ownerRes.body.business.id });

    expect(res.status).toBe(200);
    expect(res.body.business.name).toBe("Kigali Traders");
  });

  it("rejects a user with no access to the business", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const { cookies: strangerCookies } = await registerAndGetCookies(app, "stranger@example.com", "Stranger Co");

    const res = await request(app)
      .post("/auth/switch-business")
      .set("Cookie", strangerCookies)
      .send({ businessId: ownerRes.body.business.id });

    expect(res.status).toBe(403);
  });
});
