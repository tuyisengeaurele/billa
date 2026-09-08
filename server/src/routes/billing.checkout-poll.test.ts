import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";
import * as momoClientModule from "../lib/momo-client.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
  process.env.MOMO_BILLING_SUBSCRIPTION_KEY ??= "test-sub-key";
  process.env.MOMO_BILLING_API_USER ??= "test-api-user";
  process.env.MOMO_BILLING_API_KEY ??= "test-api-key";
  process.env.MOMO_BILLING_ENVIRONMENT ??= "sandbox";
});

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
});

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return { cookies: res.headers["set-cookie"] as unknown as string[], userId: res.body.user.id as string };
}

async function createPendingCheckout(
  app: ReturnType<typeof createApp>,
  cookies: string[],
  plan: "MONTHLY" | "ANNUAL" = "MONTHLY",
) {
  vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
  vi.spyOn(momoClientModule, "requestToPay").mockResolvedValue(undefined);
  const res = await request(app)
    .post("/billing/checkout")
    .set("Cookie", cookies)
    .send({ plan, phoneNumber: "250788000000" });
  return res.body.paymentId as string;
}

describe("GET /billing/checkout/:paymentId", () => {
  it("returns PENDING while MTN hasn't resolved the request", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app);
    const paymentId = await createPendingCheckout(app, cookies);
    vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({ status: "PENDING" });

    const res = await request(app).get(`/billing/checkout/${paymentId}`).set("Cookie", cookies);

    expect(res.body).toEqual({ status: "PENDING" });
  });

  it("extends currentPeriodEnd and marks the payment SUCCESSFUL once MTN confirms it", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app);
    const paymentId = await createPendingCheckout(app, cookies);
    vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({ status: "SUCCESSFUL" });

    const res = await request(app).get(`/billing/checkout/${paymentId}`).set("Cookie", cookies);

    expect(res.body).toEqual({ status: "SUCCESSFUL" });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.plan).toBe("MONTHLY");
    expect(user.currentPeriodEnd).not.toBeNull();
    expect(user.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now());

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe("SUCCESSFUL");
  });

  it("stacks a renewal on top of remaining time instead of resetting it", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app);
    const futureEnd = new Date(Date.now() + 1000 * 60 * 60 * 24 * 10);
    await prisma.user.update({ where: { id: userId }, data: { currentPeriodEnd: futureEnd, plan: "MONTHLY" } });
    const paymentId = await createPendingCheckout(app, cookies);
    vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({ status: "SUCCESSFUL" });

    await request(app).get(`/billing/checkout/${paymentId}`).set("Cookie", cookies);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const expectedEnd = futureEnd.getTime() + 30 * 24 * 60 * 60 * 1000;
    expect(user.currentPeriodEnd!.getTime()).toBe(expectedEnd);
  });

  it("stores the failure reason and marks the payment FAILED", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app);
    const paymentId = await createPendingCheckout(app, cookies);
    vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({
      status: "FAILED",
      reason: "PAYER_NOT_FOUND",
    });

    const res = await request(app).get(`/billing/checkout/${paymentId}`).set("Cookie", cookies);

    expect(res.body).toEqual({ status: "FAILED", failureReason: "PAYER_NOT_FOUND" });
  });

  it("does not call MTN again once the payment is already terminal", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app);
    const paymentId = await createPendingCheckout(app, cookies);
    const statusSpy = vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({ status: "SUCCESSFUL" });

    await request(app).get(`/billing/checkout/${paymentId}`).set("Cookie", cookies);
    await request(app).get(`/billing/checkout/${paymentId}`).set("Cookie", cookies);

    expect(statusSpy).toHaveBeenCalledTimes(1);
  });

  it("marks a stale pending payment EXPIRED without calling MTN", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app);
    const paymentId = await createPendingCheckout(app, cookies);
    await prisma.payment.update({
      where: { id: paymentId },
      data: { createdAt: new Date(Date.now() - 6 * 60 * 1000) },
    });
    const statusSpy = vi.spyOn(momoClientModule, "getRequestToPayStatus");

    const res = await request(app).get(`/billing/checkout/${paymentId}`).set("Cookie", cookies);

    expect(res.body).toEqual({ status: "EXPIRED" });
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it("returns 404 for a payment belonging to another account", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app);
    const paymentId = await createPendingCheckout(app, cookies);

    const otherRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).get(`/billing/checkout/${paymentId}`).set("Cookie", otherCookies);

    expect(res.status).toBe(404);
  });
});
