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
  return {
    cookies: res.headers["set-cookie"] as unknown as string[],
    userId: res.body.user.id as string,
    businessId: res.body.business.id as string,
  };
}

describe("GET /business/activity", () => {
  it("returns team-wide entries newest first", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    await request(app).post("/customers").set("Cookie", cookies).send({ name: "First" });
    await request(app).post("/customers").set("Cookie", cookies).send({ name: "Second" });

    const res = await request(app).get("/business/activity").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.results[0].metadata).toMatchObject({ name: "Second" });
    expect(res.body.results[0].actor.email).toBe("owner@example.com");
  });

  it("filters to one actor with actorUserId", async () => {
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
    await request(app).post("/customers").set("Cookie", ownerCookies).send({ name: "Owner's customer" });
    await request(app).post("/customers").set("Cookie", memberCookies).send({ name: "Member's customer" });

    const res = await request(app).get(`/business/activity?actorUserId=${memberId}`).set("Cookie", ownerCookies);

    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].metadata).toMatchObject({ name: "Member's customer" });
  });

  it("is readable by a member, not just the owner", async () => {
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

    const res = await request(app).get("/business/activity").set("Cookie", memberCookies);

    expect(res.status).toBe(200);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/business/activity");
    expect(res.status).toBe(401);
  });

  it("filters by date range", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    await request(app).post("/customers").set("Cookie", cookies).send({ name: "First" });

    const farFuture = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const res = await request(app).get(`/business/activity?dateFrom=${farFuture}`).set("Cookie", cookies);

    expect(res.body.total).toBe(0);
  });
});

describe("GET /business/activity/export.csv", () => {
  it("returns a CSV of the business's own activity", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    await request(app).post("/customers").set("Cookie", cookies).send({ name: "Musanze Supplies" });

    const res = await request(app).get("/business/activity/export.csv").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("owner@example.com");
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/business/activity/export.csv");
    expect(res.status).toBe(401);
  });
});
