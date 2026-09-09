import crypto from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { requireActiveSubscription } from "./require-active-subscription.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
});

beforeEach(resetDb);

function testApp(userId: string, businessId: string) {
  const app = express();
  app.use((req, _res, next) => {
    req.auth = { userId, businessId };
    next();
  });
  app.get("/probe", requireActiveSubscription, (_req, res) => res.json({ ok: true }));
  app.post("/probe", requireActiveSubscription, (_req, res) => res.json({ ok: true }));
  return app;
}

async function createUser(overrides: { trialEndsAt: Date; currentPeriodEnd?: Date | null }) {
  const user = await prisma.user.create({
    data: {
      email: `${crypto.randomUUID()}@example.com`,
      firebaseUid: crypto.randomUUID(),
      trialEndsAt: overrides.trialEndsAt,
      currentPeriodEnd: overrides.currentPeriodEnd,
    },
  });
  return user.id;
}

async function createBusiness(ownerId: string) {
  const business = await prisma.business.create({ data: { name: "Kigali Traders", ownerId } });
  return business.id;
}

describe("requireActiveSubscription", () => {
  it("allows GET requests regardless of subscription state", async () => {
    const ownerId = await createUser({ trialEndsAt: new Date(Date.now() - 1000) });
    const businessId = await createBusiness(ownerId);
    const res = await request(testApp(ownerId, businessId)).get("/probe");
    expect(res.status).toBe(200);
  });

  it("allows non-GET requests during the owner's active trial", async () => {
    const ownerId = await createUser({ trialEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24) });
    const businessId = await createBusiness(ownerId);
    const res = await request(testApp(ownerId, businessId)).post("/probe");
    expect(res.status).toBe(200);
  });

  it("blocks non-GET requests once the owner's trial has lapsed with no payment", async () => {
    const ownerId = await createUser({ trialEndsAt: new Date(Date.now() - 1000) });
    const businessId = await createBusiness(ownerId);
    const res = await request(testApp(ownerId, businessId)).post("/probe");
    expect(res.status).toBe(402);
    expect(res.body.error).toBe("subscription_required");
  });

  it("allows non-GET requests during an active paid period even if the owner's trial already ended", async () => {
    const ownerId = await createUser({
      trialEndsAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20),
      currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
    });
    const businessId = await createBusiness(ownerId);
    const res = await request(testApp(ownerId, businessId)).post("/probe");
    expect(res.status).toBe(200);
  });

  it("blocks non-GET requests once the owner's paid period has also lapsed", async () => {
    const ownerId = await createUser({
      trialEndsAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40),
      currentPeriodEnd: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
    });
    const businessId = await createBusiness(ownerId);
    const res = await request(testApp(ownerId, businessId)).post("/probe");
    expect(res.status).toBe(402);
  });

  it("lets an invited member keep working after their own personal trial has lapsed, riding on the owner's active subscription", async () => {
    const ownerId = await createUser({
      trialEndsAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20),
      currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
    });
    const businessId = await createBusiness(ownerId);
    // The member's own trial ended days ago - irrelevant, they're working in someone
    // else's business.
    const memberId = await createUser({ trialEndsAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5) });
    await prisma.businessMember.create({ data: { businessId, userId: memberId } });

    const res = await request(testApp(memberId, businessId)).post("/probe");
    expect(res.status).toBe(200);
  });

  it("blocks an invited member once the owner's own access has lapsed, even if the member's personal trial is still active", async () => {
    const ownerId = await createUser({ trialEndsAt: new Date(Date.now() - 1000) });
    const businessId = await createBusiness(ownerId);
    const memberId = await createUser({ trialEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10) });
    await prisma.businessMember.create({ data: { businessId, userId: memberId } });

    const res = await request(testApp(memberId, businessId)).post("/probe");
    expect(res.status).toBe(402);
  });

  it("blocks a request whose business no longer exists", async () => {
    const ownerId = await createUser({ trialEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24) });
    const res = await request(testApp(ownerId, "nonexistent-business-id")).post("/probe");
    expect(res.status).toBe(401);
  });
});
