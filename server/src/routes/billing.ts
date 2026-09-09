import crypto from "node:crypto";
import { Router } from "express";
import { billingCheckoutSchema, PLAN_PRICES } from "@billa/shared";
import type { BillingCheckoutInput } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate.js";
import { getBillingMomoConfig } from "../lib/billing-momo.js";
import { getAccessToken, requestToPay } from "../lib/momo-client.js";
import { getOrCreatePendingPayment } from "../lib/idempotent-payment.js";
import { resolvePendingBillingPayment } from "../lib/resolve-pending-payment.js";
import { normalizeRwandaPhoneNumber } from "../lib/phone-number.js";
import { createGeneralApiRateLimit, generalApiRateLimit } from "../middleware/general-rate-limit.js";

export const billingRouter = Router();

const MOMO_EXPIRY_MS = 5 * 60 * 1000;

billingRouter.use(requireAuth);
billingRouter.use(generalApiRateLimit);

// A checkout fires a real MTN Mobile Money prompt to the user's phone - a much
// tighter, payment-specific budget than the rest of the API, separate from the
// idempotency guard (that one collapses duplicates; this one caps distinct attempts).
const checkoutRateLimit = createGeneralApiRateLimit(process.env.NODE_ENV === "test" ? 100000 : 10);
// The client polls this every 3s for up to the payment's 5-minute expiry window, so
// one real attempt alone can account for ~100 requests.
const checkoutPollRateLimit = createGeneralApiRateLimit(process.env.NODE_ENV === "test" ? 100000 : 150, 5 * 60 * 1000);

billingRouter.post("/checkout", checkoutRateLimit, validateBody(billingCheckoutSchema), async (req, res) => {
  const body = req.body as BillingCheckoutInput;
  const { plan } = body;
  const phoneNumber = normalizeRwandaPhoneNumber(body.phoneNumber);
  const userId = req.auth!.userId;

  const cutoff = new Date(Date.now() - MOMO_EXPIRY_MS);
  const { payment, isNew } = await getOrCreatePendingPayment(
    `billing-checkout:${userId}:${plan}`,
    (tx) =>
      tx.payment.findFirst({
        where: { userId, plan, status: "PENDING", createdAt: { gt: cutoff } },
        orderBy: { createdAt: "desc" },
      }),
    (tx) =>
      tx.payment.create({
        data: {
          userId,
          plan,
          amount: PLAN_PRICES[plan],
          currency: "RWF",
          txRef: `billa-${userId}-${crypto.randomUUID()}`,
          phoneNumber,
          status: "PENDING",
        },
      }),
  );
  if (!isNew) {
    res.status(201).json({ paymentId: payment.id });
    return;
  }

  const { credentials, currency } = getBillingMomoConfig();
  try {
    const token = await getAccessToken(credentials);
    await requestToPay(credentials, token, {
      referenceId: payment.txRef,
      amount: PLAN_PRICES[plan],
      currency,
      phoneNumber,
      externalId: payment.id,
      payerMessage: `Billa ${plan === "MONTHLY" ? "monthly" : "annual"} subscription`,
      payeeNote: `Billa subscription (${payment.id})`,
    });
  } catch (err) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: err instanceof Error ? err.message : "Unknown error" },
    });
    res.status(502).json({ error: "momo_request_failed" });
    return;
  }

  res.status(201).json({ paymentId: payment.id });
});

billingRouter.get("/checkout/:paymentId", checkoutPollRateLimit, async (req, res) => {
  const { paymentId } = req.params;
  const userId = req.auth!.userId;

  const payment = await prisma.payment.findFirst({ where: { id: paymentId, userId } });
  if (!payment) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  if (payment.status !== "PENDING") {
    res.json({ status: payment.status, failureReason: payment.failureReason });
    return;
  }

  if (Date.now() - payment.createdAt.getTime() > MOMO_EXPIRY_MS) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "EXPIRED" } });
    res.json({ status: "EXPIRED" });
    return;
  }

  const resolution = await resolvePendingBillingPayment(payment);
  res.json(resolution);
});

billingRouter.get("/status", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const activeUntil = user.currentPeriodEnd ?? user.trialEndsAt;
  res.json({ trialEndsAt: user.trialEndsAt, currentPeriodEnd: user.currentPeriodEnd, plan: user.plan, activeUntil });
});
