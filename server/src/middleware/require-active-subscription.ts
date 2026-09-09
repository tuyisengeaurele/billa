import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET") {
    next();
    return;
  }

  // Access is a property of the business, not of whichever member happens to be
  // signed in: one subscription covers the owner and everyone they've invited, so
  // it's the owner's trial/subscription that decides this, never an invited member's
  // own (a team member's personal trial has nothing to do with the business they're
  // working in - without this, an invited member gets locked out of a business the
  // owner is actively paying for the moment their own unrelated trial clock runs out).
  const business = await prisma.business.findUnique({ where: { id: req.auth!.businessId } });
  if (!business) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const owner = await prisma.user.findUnique({ where: { id: business.ownerId } });
  if (!owner) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const activeUntil = owner.currentPeriodEnd ?? owner.trialEndsAt;
  if (activeUntil > new Date()) {
    next();
    return;
  }

  res.status(402).json({ error: "subscription_required" });
}
