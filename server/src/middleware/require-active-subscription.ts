import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET") {
    next();
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const activeUntil = user.currentPeriodEnd ?? user.trialEndsAt;
  if (activeUntil > new Date()) {
    next();
    return;
  }

  res.status(402).json({ error: "subscription_required" });
}
