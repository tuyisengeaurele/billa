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

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return { cookies: res.headers["set-cookie"] as unknown as string[], userId: res.body.user.id as string };
}

describe("GET /businesses", () => {
  it("lists businesses owned by the caller, ordered by creation", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app);
    await prisma.business.create({ data: { name: "Side Hustle", ownerId: userId } });

    const res = await request(app).get("/businesses").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.businesses.map((b: { name: string }) => b.name)).toEqual(["Kigali Traders", "Side Hustle"]);
  });

  it("does not include another account's businesses", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app);
    await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });

    const res = await request(app).get("/businesses").set("Cookie", cookies);

    expect(res.body.businesses).toHaveLength(1);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/businesses");
    expect(res.status).toBe(401);
  });

  it("includes businesses the caller is a member of, alongside owned ones", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app);
    const ownerRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other-owner@example.com", email: "other-owner@example.com" }),
      businessName: "Other Co",
    });
    await prisma.businessMember.create({
      data: { businessId: ownerRes.body.business.id, userId },
    });

    const res = await request(app).get("/businesses").set("Cookie", cookies);

    expect(res.body.businesses.map((b: { name: string }) => b.name)).toEqual(["Kigali Traders", "Other Co"]);
  });
});

describe("POST /businesses", () => {
  it("creates a new business and switches the session into it", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app);

    const res = await request(app).post("/businesses").set("Cookie", cookies).send({ name: "Side Hustle" });

    expect(res.status).toBe(201);
    expect(res.body.business.name).toBe("Side Hustle");

    const newCookies = res.headers["set-cookie"] as unknown as string[];
    const meRes = await request(app).get("/auth/me").set("Cookie", newCookies);
    expect(meRes.body.business.name).toBe("Side Hustle");

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.lastActiveBusinessId).toBe(res.body.business.id);
  });

  it("returns 409 once the account already owns 3 businesses", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app);
    await prisma.business.create({ data: { name: "Second", ownerId: userId } });
    await prisma.business.create({ data: { name: "Third", ownerId: userId } });

    const res = await request(app).post("/businesses").set("Cookie", cookies).send({ name: "Fourth" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("business_limit_reached");
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/businesses").send({ name: "Side Hustle" });
    expect(res.status).toBe(401);
  });
});
