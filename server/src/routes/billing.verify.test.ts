import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";

vi.mock("../lib/flutterwave.js", () => ({
  initiateCheckout: vi.fn(),
  verifyTransaction: vi.fn(),
}));

import { verifyTransaction } from "../lib/flutterwave.js";

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
  return { cookies: res.headers["set-cookie"] as unknown as string[], businessId: res.body.business.id as string };
}

async function createPendingPayment(businessId: string, userId: string, plan: "MONTHLY" | "ANNUAL", amount: number) {
  return prisma.payment.create({
    data: { businessId, userId, plan, amount, currency: "RWF", txRef: `billa-${businessId}-test`, status: "PENDING" },
  });
}

describe("POST /billing/verify", () => {
  it("extends currentPeriodEnd on a genuine successful payment", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app);
    const user = await prisma.user.findFirstOrThrow({ where: { businessId } });
    const payment = await createPendingPayment(businessId, user.id, "MONTHLY", 6500);

    vi.mocked(verifyTransaction).mockResolvedValue({
      txRef: payment.txRef,
      amount: 6500,
      currency: "RWF",
      status: "successful",
    });

    const res = await request(app)
      .post("/billing/verify")
      .set("Cookie", cookies)
      .send({ txRef: payment.txRef, transactionId: "fw-123" });

    expect(res.status).toBe(200);

    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(business.plan).toBe("MONTHLY");
    expect(business.currentPeriodEnd).not.toBeNull();
    expect(business.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now());

    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { txRef: payment.txRef } });
    expect(updatedPayment.status).toBe("SUCCESSFUL");
    expect(updatedPayment.flutterwaveTxId).toBe("fw-123");
  });

  it("is idempotent when called twice for the same payment", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app);
    const user = await prisma.user.findFirstOrThrow({ where: { businessId } });
    const payment = await createPendingPayment(businessId, user.id, "MONTHLY", 6500);

    vi.mocked(verifyTransaction).mockResolvedValue({
      txRef: payment.txRef,
      amount: 6500,
      currency: "RWF",
      status: "successful",
    });

    await request(app)
      .post("/billing/verify")
      .set("Cookie", cookies)
      .send({ txRef: payment.txRef, transactionId: "fw-123" });
    const firstPeriodEnd = (await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).currentPeriodEnd;

    const res = await request(app)
      .post("/billing/verify")
      .set("Cookie", cookies)
      .send({ txRef: payment.txRef, transactionId: "fw-123" });

    expect(res.status).toBe(200);
    const secondPeriodEnd = (await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).currentPeriodEnd;
    expect(secondPeriodEnd?.getTime()).toBe(firstPeriodEnd?.getTime());
  });

  it("stacks an early renewal on top of remaining time instead of resetting it", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app);
    const user = await prisma.user.findFirstOrThrow({ where: { businessId } });
    const futureEnd = new Date(Date.now() + 1000 * 60 * 60 * 24 * 10);
    await prisma.business.update({ where: { id: businessId }, data: { currentPeriodEnd: futureEnd, plan: "MONTHLY" } });
    const payment = await createPendingPayment(businessId, user.id, "MONTHLY", 6500);

    vi.mocked(verifyTransaction).mockResolvedValue({
      txRef: payment.txRef,
      amount: 6500,
      currency: "RWF",
      status: "successful",
    });

    await request(app)
      .post("/billing/verify")
      .set("Cookie", cookies)
      .send({ txRef: payment.txRef, transactionId: "fw-123" });

    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const expectedEnd = futureEnd.getTime() + 30 * 24 * 60 * 60 * 1000;
    expect(business.currentPeriodEnd!.getTime()).toBe(expectedEnd);
  });

  it("marks the payment failed when the verified amount doesn't match", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app);
    const user = await prisma.user.findFirstOrThrow({ where: { businessId } });
    const payment = await createPendingPayment(businessId, user.id, "MONTHLY", 6500);

    vi.mocked(verifyTransaction).mockResolvedValue({
      txRef: payment.txRef,
      amount: 100,
      currency: "RWF",
      status: "successful",
    });

    const res = await request(app)
      .post("/billing/verify")
      .set("Cookie", cookies)
      .send({ txRef: payment.txRef, transactionId: "fw-123" });

    expect(res.status).toBe(400);
    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { txRef: payment.txRef } });
    expect(updatedPayment.status).toBe("FAILED");
  });

  it("returns 404 for a txRef belonging to another business", async () => {
    const app = createApp();
    const { businessId } = await registerAndGetCookies(app);
    const user = await prisma.user.findFirstOrThrow({ where: { businessId } });
    const payment = await createPendingPayment(businessId, user.id, "MONTHLY", 6500);

    const otherRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app)
      .post("/billing/verify")
      .set("Cookie", otherCookies)
      .send({ txRef: payment.txRef, transactionId: "fw-123" });

    expect(res.status).toBe(404);
  });
});
