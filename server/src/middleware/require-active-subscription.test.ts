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

function testApp(userId: string) {
  const app = express();
  app.use((req, _res, next) => {
    req.auth = { userId, businessId: "irrelevant" };
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

describe("requireActiveSubscription", () => {
  it("allows GET requests regardless of subscription state", async () => {
    const userId = await createUser({ trialEndsAt: new Date(Date.now() - 1000) });
    const res = await request(testApp(userId)).get("/probe");
    expect(res.status).toBe(200);
  });

  it("allows non-GET requests during an active trial", async () => {
    const userId = await createUser({ trialEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24) });
    const res = await request(testApp(userId)).post("/probe");
    expect(res.status).toBe(200);
  });

  it("blocks non-GET requests once the trial has lapsed with no payment", async () => {
    const userId = await createUser({ trialEndsAt: new Date(Date.now() - 1000) });
    const res = await request(testApp(userId)).post("/probe");
    expect(res.status).toBe(402);
    expect(res.body.error).toBe("subscription_required");
  });

  it("allows non-GET requests during an active paid period even if the trial already ended", async () => {
    const userId = await createUser({
      trialEndsAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20),
      currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
    });
    const res = await request(testApp(userId)).post("/probe");
    expect(res.status).toBe(200);
  });

  it("blocks non-GET requests once a paid period has also lapsed", async () => {
    const userId = await createUser({
      trialEndsAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40),
      currentPeriodEnd: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
    });
    const res = await request(testApp(userId)).post("/probe");
    expect(res.status).toBe(402);
  });
});
