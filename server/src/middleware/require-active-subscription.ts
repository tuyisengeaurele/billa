import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET") {
    next();
    return;
  }

  const business = await prisma.business.findUnique({ where: { id: req.auth!.businessId } });
  if (!business) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const activeUntil = business.currentPeriodEnd ?? business.trialEndsAt;
  if (activeUntil > new Date()) {
    next();
    return;
  }

  res.status(402).json({ error: "subscription_required" });
}
