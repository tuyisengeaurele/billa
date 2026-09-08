import crypto from "node:crypto";
import { Router } from "express";
import { billingCheckoutSchema, PLAN_PRICES } from "@billa/shared";
import type { BillingCheckoutInput } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate.js";
import { getBillingMomoConfig } from "../lib/billing-momo.js";
import { getAccessToken, getRequestToPayStatus, requestToPay } from "../lib/momo-client.js";

export const billingRouter = Router();

const PLAN_DAYS: Record<"MONTHLY" | "ANNUAL", number> = { MONTHLY: 30, ANNUAL: 365 };
const MOMO_EXPIRY_MS = 5 * 60 * 1000;

billingRouter.post("/checkout", requireAuth, validateBody(billingCheckoutSchema), async (req, res) => {
  const { plan, phoneNumber } = req.body as BillingCheckoutInput;
  const userId = req.auth!.userId;

  const existing = await prisma.payment.findFirst({
    where: { userId, plan, status: "PENDING", createdAt: { gt: new Date(Date.now() - MOMO_EXPIRY_MS) } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    res.status(201).json({ paymentId: existing.id });
    return;
  }

  const txRef = `billa-${userId}-${crypto.randomUUID()}`;
  const payment = await prisma.payment.create({
    data: { userId, plan, amount: PLAN_PRICES[plan], currency: "RWF", txRef, phoneNumber, status: "PENDING" },
  });

  const { credentials, currency } = getBillingMomoConfig();
  try {
    const token = await getAccessToken(credentials);
    await requestToPay(credentials, token, {
      referenceId: txRef,
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

billingRouter.get("/checkout/:paymentId", requireAuth, async (req, res) => {
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

  const { credentials } = getBillingMomoConfig();
  let mtnStatus: { status: "PENDING" | "SUCCESSFUL" | "FAILED"; reason?: string };
  try {
    const token = await getAccessToken(credentials);
    mtnStatus = await getRequestToPayStatus(credentials, token, payment.txRef);
  } catch {
    res.json({ status: "PENDING" });
    return;
  }

  if (mtnStatus.status === "PENDING") {
    res.json({ status: "PENDING" });
    return;
  }

  if (mtnStatus.status === "FAILED") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: mtnStatus.reason ?? null },
    });
    res.json({ status: "FAILED", failureReason: mtnStatus.reason ?? null });
    return;
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const now = new Date();
  const base = user.currentPeriodEnd && user.currentPeriodEnd > now ? user.currentPeriodEnd : now;
  const currentPeriodEnd = new Date(base.getTime() + PLAN_DAYS[payment.plan] * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.payment.update({ where: { id: payment.id }, data: { status: "SUCCESSFUL" } }),
    prisma.user.update({ where: { id: userId }, data: { currentPeriodEnd, plan: payment.plan } }),
  ]);

  res.json({ status: "SUCCESSFUL" });
});

billingRouter.get("/status", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const activeUntil = user.currentPeriodEnd ?? user.trialEndsAt;
  res.json({ trialEndsAt: user.trialEndsAt, currentPeriodEnd: user.currentPeriodEnd, plan: user.plan, activeUntil });
});
