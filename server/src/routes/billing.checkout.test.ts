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
  return res.headers["set-cookie"] as unknown as string[];
}

describe("POST /billing/checkout", () => {
  it("creates a pending payment and calls MTN with the sandbox currency", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
    const requestToPaySpy = vi.spyOn(momoClientModule, "requestToPay").mockResolvedValue(undefined);

    const res = await request(app)
      .post("/billing/checkout")
      .set("Cookie", cookies)
      .send({ plan: "MONTHLY", phoneNumber: "250788000000" });

    expect(res.status).toBe(201);
    expect(res.body.paymentId).toBeTruthy();
    expect(requestToPaySpy).toHaveBeenCalledWith(
      expect.anything(),
      "token-123",
      expect.objectContaining({ currency: "EUR", amount: 6500 }),
    );

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: res.body.paymentId } });
    expect(payment.status).toBe("PENDING");
    expect(payment.amount).toBe(6500);
    expect(payment.currency).toBe("RWF");
  });

  it("returns the existing pending payment for the same plan instead of creating a second one", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
    const requestToPaySpy = vi.spyOn(momoClientModule, "requestToPay").mockResolvedValue(undefined);

    const first = await request(app)
      .post("/billing/checkout")
      .set("Cookie", cookies)
      .send({ plan: "MONTHLY", phoneNumber: "250788000000" });
    const second = await request(app)
      .post("/billing/checkout")
      .set("Cookie", cookies)
      .send({ plan: "MONTHLY", phoneNumber: "250788000000" });

    expect(second.body.paymentId).toBe(first.body.paymentId);
    expect(requestToPaySpy).toHaveBeenCalledTimes(1);
  });

  it("creates a separate payment for a different plan even while one is pending", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
    vi.spyOn(momoClientModule, "requestToPay").mockResolvedValue(undefined);

    const monthly = await request(app)
      .post("/billing/checkout")
      .set("Cookie", cookies)
      .send({ plan: "MONTHLY", phoneNumber: "250788000000" });
    const annual = await request(app)
      .post("/billing/checkout")
      .set("Cookie", cookies)
      .send({ plan: "ANNUAL", phoneNumber: "250788000000" });

    expect(annual.body.paymentId).not.toBe(monthly.body.paymentId);
  });

  it("marks the payment FAILED when the MTN call itself fails", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
    vi.spyOn(momoClientModule, "requestToPay").mockRejectedValue(new Error("insufficient funds"));

    const res = await request(app)
      .post("/billing/checkout")
      .set("Cookie", cookies)
      .send({ plan: "MONTHLY", phoneNumber: "250788000000" });

    expect(res.status).toBe(502);
    const payment = await prisma.payment.findFirstOrThrow({});
    expect(payment.status).toBe("FAILED");
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp())
      .post("/billing/checkout")
      .send({ plan: "MONTHLY", phoneNumber: "250788000000" });

    expect(res.status).toBe(401);
  });
});
