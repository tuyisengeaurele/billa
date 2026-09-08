import * as Sentry from "@sentry/node";
import { prisma } from "./prisma.js";
import { buildMomoCredentials } from "./business-momo.js";
import { resolvePendingBillingPayment, resolvePendingMomoPaymentRequest } from "./resolve-pending-payment.js";

const EXPIRY_MS = 5 * 60 * 1000;
// Anything still PENDING past this age is treated as abandoned rather than checked
// against MTN again - a request-to-pay reference this old is not meaningfully "still
// in flight" by any reasonable definition, and this bounds how far back each run looks.
const RECONCILE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export interface ReconciliationResult {
  billingChecked: number;
  billingResolved: number;
  momoChecked: number;
  momoResolved: number;
}

/**
 * Both payment flows (subscription checkout and invoice MoMo requests) are normally
 * resolved by the client polling a status endpoint, which checks MTN and applies the
 * outcome. That works as long as someone's tab stays open to do the polling - if it
 * doesn't (closed early, phone died, connection dropped), a payment that actually
 * succeeded on MTN's side can be left stuck PENDING forever with no record of it.
 *
 * This job is the safety net: it re-checks every still-PENDING payment directly
 * against MTN's own status API (the same call the poll routes make) and applies
 * whatever it finds, using the exact same resolution logic - so a payment that
 * succeeded gets credited even if nobody was watching when it did. Anything old
 * enough to be clearly abandoned is expired without spending another MTN call on it.
 */
export async function reconcilePendingPayments(): Promise<ReconciliationResult> {
  const now = Date.now();
  const expiredCutoff = new Date(now - EXPIRY_MS);
  const lookbackCutoff = new Date(now - RECONCILE_LOOKBACK_MS);

  let billingResolved = 0;
  const pendingPayments = await prisma.payment.findMany({
    where: { status: "PENDING", createdAt: { lt: expiredCutoff, gt: lookbackCutoff } },
  });
  for (const payment of pendingPayments) {
    try {
      const resolution = await resolvePendingBillingPayment(payment);
      if (resolution.status !== "PENDING") billingResolved += 1;
    } catch (err) {
      Sentry.captureException(err);
    }
  }
  await prisma.payment.updateMany({
    where: { status: "PENDING", createdAt: { lte: lookbackCutoff } },
    data: { status: "EXPIRED" },
  });

  let momoResolved = 0;
  const pendingMomoRequests = await prisma.momoPaymentRequest.findMany({
    where: { status: "PENDING", createdAt: { lt: expiredCutoff, gt: lookbackCutoff } },
  });
  for (const momoRequest of pendingMomoRequests) {
    const business = await prisma.business.findUnique({ where: { id: momoRequest.businessId } });
    const credentials = business ? buildMomoCredentials(business) : null;
    if (!business || !credentials) continue;
    try {
      const resolution = await resolvePendingMomoPaymentRequest(momoRequest, credentials, business.ownerId);
      if (resolution.status !== "PENDING") momoResolved += 1;
    } catch (err) {
      Sentry.captureException(err);
    }
  }
  await prisma.momoPaymentRequest.updateMany({
    where: { status: "PENDING", createdAt: { lte: lookbackCutoff } },
    data: { status: "EXPIRED" },
  });

  return {
    billingChecked: pendingPayments.length,
    billingResolved,
    momoChecked: pendingMomoRequests.length,
    momoResolved,
  };
}
