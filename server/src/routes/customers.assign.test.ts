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

async function registerAndGetIdentity(app: ReturnType<typeof createApp>, email = "owner@example.com") {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: email, email }),
    businessName: "Kigali Traders",
  });
  return {
    cookies: res.headers["set-cookie"] as unknown as string[],
    userId: res.body.user.id as string,
  };
}

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[]) {
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Kigali Traders Ltd" });
  return res.body.customer.id as string;
}

async function addMember(businessId: string, email: string) {
  const user = await prisma.user.create({
    data: { email, firebaseUid: email, trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
  });
  await prisma.businessMember.create({ data: { businessId, userId: user.id, role: "MEMBER" } });
  return user.id;
}

describe("GET /customers/team-members", () => {
  it("lists the business owner and members", async () => {
    const app = createApp();
    const { cookies, userId: ownerId } = await registerAndGetIdentity(app);
    const business = await prisma.business.findFirstOrThrow({ where: { ownerId } });
    const memberId = await addMember(business.id, "member@example.com");

    const res = await request(app).get("/customers/team-members").set("Cookie", cookies);

    expect(res.status).toBe(200);
    const ids = res.body.results.map((r: { id: string }) => r.id);
    expect(ids).toEqual(expect.arrayContaining([ownerId, memberId]));
  });
});

describe("PATCH /customers/:id assignedToId", () => {
  it("assigns a customer to a team member", async () => {
    const app = createApp();
    const { cookies, userId: ownerId } = await registerAndGetIdentity(app);
    const business = await prisma.business.findFirstOrThrow({ where: { ownerId } });
    const memberId = await addMember(business.id, "member@example.com");
    const id = await createCustomer(app, cookies);

    const res = await request(app)
      .patch(`/customers/${id}`)
      .set("Cookie", cookies)
      .send({ assignedToId: memberId });

    expect(res.status).toBe(200);
    expect(res.body.customer.assignedToId).toBe(memberId);
  });

  it("unassigns a customer when assignedToId is null", async () => {
    const app = createApp();
    const { cookies, userId: ownerId } = await registerAndGetIdentity(app);
    const business = await prisma.business.findFirstOrThrow({ where: { ownerId } });
    const memberId = await addMember(business.id, "member@example.com");
    const id = await createCustomer(app, cookies);
    await request(app).patch(`/customers/${id}`).set("Cookie", cookies).send({ assignedToId: memberId });

    const res = await request(app).patch(`/customers/${id}`).set("Cookie", cookies).send({ assignedToId: null });

    expect(res.status).toBe(200);
    expect(res.body.customer.assignedToId).toBeNull();
  });

  it("rejects assigning to a user outside the business", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetIdentity(app);
    const { userId: strangerId } = await registerAndGetIdentity(app, "stranger@example.com");
    const id = await createCustomer(app, cookies);

    const res = await request(app)
      .patch(`/customers/${id}`)
      .set("Cookie", cookies)
      .send({ assignedToId: strangerId });

    expect(res.status).toBe(400);
  });
});

describe("GET /customers with assignedToId filter", () => {
  it("returns only customers assigned to the given user", async () => {
    const app = createApp();
    const { cookies, userId: ownerId } = await registerAndGetIdentity(app);
    const business = await prisma.business.findFirstOrThrow({ where: { ownerId } });
    const memberId = await addMember(business.id, "member@example.com");
    const assignedId = await createCustomer(app, cookies);
    await createCustomer(app, cookies);
    await request(app).patch(`/customers/${assignedId}`).set("Cookie", cookies).send({ assignedToId: memberId });

    const res = await request(app).get(`/customers?assignedToId=${memberId}`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].id).toBe(assignedId);
    expect(res.body.results[0].assignedTo.id).toBe(memberId);
  });
});
