import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

/**
 * Gates only the /:id/finalize action: when a business has opted into
 * requireApprovalToFinalize, a draft can still be created and edited by
 * anyone with write access, but only the owner can finalize it. Off by
 * default so existing businesses keep today's behavior unchanged.
 */
export async function requireFinalizePermission(req: Request, res: Response, next: NextFunction) {
  const { userId, businessId } = req.auth!;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { ownerId: true, requireApprovalToFinalize: true },
  });

  if (!business || !business.requireApprovalToFinalize || business.ownerId === userId) {
    next();
    return;
  }

  res.status(403).json({ error: "finalize_requires_approval" });
}
