import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

/**
 * Read-only enforcement for the ACCOUNTANT role: blocks any non-GET request
 * once the caller is confirmed to be an accountant on this business. The
 * business owner always passes regardless of role. Applied per-router
 * (mirrors requireAuth/requireActiveSubscription's existing convention)
 * on every router that touches business data a customer/item/document/
 * payment mutation could reach.
 */
export async function blockAccountantMutations(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET") {
    next();
    return;
  }

  const { userId, businessId } = req.auth!;
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { ownerId: true } });
  if (!business || business.ownerId === userId) {
    next();
    return;
  }

  const member = await prisma.businessMember.findUnique({
    where: { businessId_userId: { businessId, userId } },
  });
  if (member?.role === "ACCOUNTANT") {
    res.status(403).json({ error: "read_only_role" });
    return;
  }

  next();
}
