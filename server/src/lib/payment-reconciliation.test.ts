import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma.js";
import { resetDb } from "../test/db.js";
import { reconcilePendingPayments } from "./payment-reconciliation.js";
import { encrypt } from "./encryption.js";
import * as momoClientModule from "./momo-client.js";

beforeAll(() => {
  process.env.MOMO_CREDENTIALS_ENCRYPTION_KEY ??= Buffer.alloc(32, 4).toString("base64");
  process.env.MOMO_BILLING_SUBSCRIPTION_KEY ??= "test-sub-key";
  process.env.MOMO_BILLING_API_USER ??= "test-api-user";
  process.env.MOMO_BILLING_API_KEY ??= "test-api-key";
  process.env.MOMO_BILLING_ENVIRONMENT ??= "sandbox";
});

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
});

async function createUser() {
  return prisma.user.create({
    data: {
      email: `owner-${Date.now()}-${Math.random()}@example.com`,
      firebaseUid: `uid-${Date.now()}-${Math.random()}`,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
}

async function createStuckBillingPayment(overrides: { createdAt: Date; userId: string }) {
  return prisma.payment.create({
    data: {
      userId: overrides.userId,
      plan: "MONTHLY",
      amount: 6500,
      currency: "RWF",
      txRef: `billa-${Math.random()}`,
      phoneNumber: "250788000000",
      status: "PENDING",
      createdAt: overrides.createdAt,
    },
  });
}

describe("reconcilePendingPayments", () => {
  it("credits a subscription whose payment actually succeeded on MTN but was never polled", async () => {
    const user = await createUser();
    // Older than the 5-minute poll window, but well inside the 24h reconciliation lookback.
    const staleCreatedAt = new Date(Date.now() - 30 * 60 * 1000);
    await createStuckBillingPayment({ userId: user.id, createdAt: staleCreatedAt });

    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
    vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({ status: "SUCCESSFUL" });

    const result = await reconcilePendingPayments();

    expect(result.billingChecked).toBe(1);
    expect(result.billingResolved).toBe(1);
    const payment = await prisma.payment.findFirstOrThrow({});
    expect(payment.status).toBe("SUCCESSFUL");
    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.currentPeriodEnd).not.toBeNull();
  });

  it("leaves a genuinely still-pending payment alone", async () => {
    const user = await createUser();
    await createStuckBillingPayment({ userId: user.id, createdAt: new Date(Date.now() - 30 * 60 * 1000) });

    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
    vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({ status: "PENDING" });

    const result = await reconcilePendingPayments();

    expect(result.billingResolved).toBe(0);
    const payment = await prisma.payment.findFirstOrThrow({});
    expect(payment.status).toBe("PENDING");
  });

  it("expires a payment abandoned for over 24 hours without calling MTN", async () => {
    const user = await createUser();
    await createStuckBillingPayment({ userId: user.id, createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) });
    const statusSpy = vi.spyOn(momoClientModule, "getRequestToPayStatus");

    const result = await reconcilePendingPayments();

    expect(result.billingChecked).toBe(0);
    expect(statusSpy).not.toHaveBeenCalled();
    const payment = await prisma.payment.findFirstOrThrow({});
    expect(payment.status).toBe("EXPIRED");
  });

  it("records an invoice payment for a MoMo request that succeeded without being polled", async () => {
    const user = await createUser();
    const business = await prisma.business.create({
      data: {
        ownerId: user.id,
        name: "Kigali Traders",
        momoEnabled: true,
        momoEnvironment: "sandbox",
        momoTargetEnvironment: "sandbox",
        momoSubscriptionKeyEnc: encrypt("sub-key"),
        momoApiUserEnc: encrypt("api-user"),
        momoApiKeyEnc: encrypt("api-key"),
      },
    });
    const customer = await prisma.customer.create({ data: { businessId: business.id, name: "Acme Ltd" } });
    const document = await prisma.document.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        type: "INVOICE",
        status: "FINALIZED",
        template: "MINIMAL",
        number: "INV-0001",
        issueDate: new Date(),
        subtotal: 10000,
        taxTotal: 0,
        total: 10000,
        lines: { create: [{ description: "Cement", quantity: 1, unitPrice: 10000, taxRate: 0, lineTotal: 10000, sortOrder: 0 }] },
      },
    });
    await prisma.momoPaymentRequest.create({
      data: {
        businessId: business.id,
        documentId: document.id,
        referenceId: `ref-${Math.random()}`,
        phoneNumber: "250788000000",
        amount: 10000,
        status: "PENDING",
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
      },
    });

    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
    vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({ status: "SUCCESSFUL" });

    const result = await reconcilePendingPayments();

    expect(result.momoResolved).toBe(1);
    const updatedDoc = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(updatedDoc.paymentStatus).toBe("PAID");
    const payments = await prisma.invoicePayment.findMany({ where: { documentId: document.id } });
    expect(payments).toHaveLength(1);
  });
});
