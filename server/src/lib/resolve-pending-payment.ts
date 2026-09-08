import type { Payment, MomoPaymentRequest } from "@prisma/client";
import { prisma } from "./prisma.js";
import { getAccessToken, getRequestToPayStatus } from "./momo-client.js";
import type { MomoCredentials } from "./momo-client.js";
import { getBillingMomoConfig } from "./billing-momo.js";
import { getInvoiceOutstandingBalance } from "./invoice-payment-status.js";
import { recordInvoicePayment } from "./record-invoice-payment.js";

const PLAN_DAYS: Record<"MONTHLY" | "ANNUAL", number> = { MONTHLY: 30, ANNUAL: 365 };

export type PaymentResolution =
  | { status: "PENDING" }
  | { status: "EXPIRED" }
  | { status: "FAILED"; failureReason: string | null }
  | { status: "SUCCESSFUL" };

/**
 * Checks one still-PENDING subscription Payment against MTN's own status API and
 * applies whatever it finds (extends the user's billing period on success). Shared
 * by the checkout poll route and the background reconciliation job, so "what happens
 * when MTN says X" - the part that actually moves money and grants access - lives in
 * exactly one place instead of being copied between the two callers.
 */
export async function resolvePendingBillingPayment(payment: Payment): Promise<PaymentResolution> {
  const { credentials } = getBillingMomoConfig();
  let mtnStatus: { status: "PENDING" | "SUCCESSFUL" | "FAILED"; reason?: string };
  try {
    const token = await getAccessToken(credentials);
    mtnStatus = await getRequestToPayStatus(credentials, token, payment.txRef);
  } catch {
    return { status: "PENDING" };
  }

  if (mtnStatus.status === "PENDING") {
    return { status: "PENDING" };
  }

  if (mtnStatus.status === "FAILED") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: mtnStatus.reason ?? null },
    });
    return { status: "FAILED", failureReason: mtnStatus.reason ?? null };
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: payment.userId } });
  const now = new Date();
  const base = user.currentPeriodEnd && user.currentPeriodEnd > now ? user.currentPeriodEnd : now;
  const currentPeriodEnd = new Date(base.getTime() + PLAN_DAYS[payment.plan] * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.payment.update({ where: { id: payment.id }, data: { status: "SUCCESSFUL" } }),
    prisma.user.update({ where: { id: payment.userId }, data: { currentPeriodEnd, plan: payment.plan } }),
  ]);

  return { status: "SUCCESSFUL" };
}

/**
 * Same idea for a MomoPaymentRequest (a customer paying one of a business's own
 * invoices): checks MTN, and on success records the InvoicePayment that actually
 * marks the invoice paid. Shared by the public poll route and the reconciliation job.
 */
export async function resolvePendingMomoPaymentRequest(
  momoRequest: MomoPaymentRequest,
  credentials: MomoCredentials,
  ownerId: string,
): Promise<PaymentResolution> {
  let mtnStatus: { status: "PENDING" | "SUCCESSFUL" | "FAILED"; reason?: string };
  try {
    const token = await getAccessToken(credentials);
    mtnStatus = await getRequestToPayStatus(credentials, token, momoRequest.referenceId);
  } catch {
    return { status: "PENDING" };
  }

  if (mtnStatus.status === "PENDING") {
    return { status: "PENDING" };
  }

  if (mtnStatus.status === "FAILED") {
    await prisma.momoPaymentRequest.update({
      where: { id: momoRequest.id },
      data: { status: "FAILED", failureReason: mtnStatus.reason ?? null },
    });
    return { status: "FAILED", failureReason: mtnStatus.reason ?? null };
  }

  const balance = await getInvoiceOutstandingBalance(momoRequest.documentId);
  if (!balance || balance.amountOwed < momoRequest.amount) {
    await prisma.momoPaymentRequest.update({
      where: { id: momoRequest.id },
      data: { status: "FAILED", failureReason: "already_paid" },
    });
    return { status: "FAILED", failureReason: "already_paid" };
  }

  await recordInvoicePayment({
    businessId: momoRequest.businessId,
    documentId: momoRequest.documentId,
    amount: momoRequest.amount,
    method: "MOBILE_MONEY",
    paidOn: new Date(),
    createdByUserId: ownerId,
    referenceNumber: momoRequest.referenceId,
    momoPaymentRequestId: momoRequest.id,
  });
  await prisma.momoPaymentRequest.update({ where: { id: momoRequest.id }, data: { status: "SUCCESSFUL" } });

  return { status: "SUCCESSFUL" };
}
