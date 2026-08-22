import crypto from "node:crypto";
import { Router } from "express";
import { billingCheckoutSchema, billingVerifySchema, PLAN_PRICES } from "@billa/shared";
import type { BillingCheckoutInput, BillingVerifyInput } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate.js";
import { initiateCheckout, verifyTransaction } from "../lib/flutterwave.js";

export const billingRouter = Router();

const PLAN_DAYS: Record<"MONTHLY" | "ANNUAL", number> = { MONTHLY: 30, ANNUAL: 365 };

billingRouter.post("/checkout", requireAuth, validateBody(billingCheckoutSchema), async (req, res) => {
  const { plan } = req.body as BillingCheckoutInput;
  const userId = req.auth!.userId;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const txRef = `billa-${userId}-${crypto.randomUUID()}`;
  await prisma.payment.create({
    data: { userId, plan, amount: PLAN_PRICES[plan], currency: "RWF", txRef, status: "PENDING" },
  });
  const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  const { link } = await initiateCheckout({
    txRef,
    amount: PLAN_PRICES[plan],
    currency: "RWF",
    redirectUrl: `${clientOrigin}/billing/callback`,
    customerEmail: user!.email,
  });
  res.json({ link });
});

async function verifyAndRecordPayment(
  txRef: string,
  transactionId: string,
): Promise<"success" | "already_processed" | "mismatch"> {
  const payment = await prisma.payment.findUnique({ where: { txRef } });
  if (!payment) throw new Error("payment_not_found");
  if (payment.status === "SUCCESSFUL") return "already_processed";
  const verified = await verifyTransaction(transactionId);
  if (
    verified.txRef !== txRef ||
    verified.status !== "successful" ||
    verified.amount < payment.amount ||
    verified.currency !== payment.currency
  ) {
    await prisma.payment.update({ where: { txRef }, data: { status: "FAILED" } });
    return "mismatch";
  }
  const user = await prisma.user.findUnique({ where: { id: payment.userId } });
  const now = new Date();
  const base = user!.currentPeriodEnd && user!.currentPeriodEnd > now ? user!.currentPeriodEnd : now;
  const currentPeriodEnd = new Date(base.getTime() + PLAN_DAYS[payment.plan] * 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.payment.update({ where: { txRef }, data: { status: "SUCCESSFUL", flutterwaveTxId: transactionId } }),
    prisma.user.update({ where: { id: payment.userId }, data: { currentPeriodEnd, plan: payment.plan } }),
  ]);
  return "success";
}

billingRouter.post("/verify", requireAuth, validateBody(billingVerifySchema), async (req, res) => {
  const { txRef, transactionId } = req.body as BillingVerifyInput;
  const userId = req.auth!.userId;
  const payment = await prisma.payment.findFirst({ where: { txRef, userId } });
  if (!payment) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  try {
    const result = await verifyAndRecordPayment(txRef, transactionId);
    if (result === "mismatch") {
      res.status(400).json({ error: "verification_failed" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "verification_failed" });
  }
});

billingRouter.post("/webhook", async (req, res) => {
  const signature = req.header("verif-hash");
  if (!signature || signature !== process.env.FLUTTERWAVE_WEBHOOK_HASH) {
    res.status(401).json({ error: "invalid_signature" });
    return;
  }
  const txRef = req.body?.data?.tx_ref as string | undefined;
  const transactionId = req.body?.data?.id ? String(req.body.data.id) : undefined;
  if (!txRef || !transactionId) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  try {
    await verifyAndRecordPayment(txRef, transactionId);
  } catch {
    /* swallow */
  }
  res.json({ ok: true });
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
