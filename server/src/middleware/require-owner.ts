import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function requireOwner(req: Request, res: Response, next: NextFunction) {
  const business = await prisma.business.findUnique({ where: { id: req.auth!.businessId } });
  if (!business || business.ownerId !== req.auth!.userId) {
    res.status(403).json({ error: "not_owner" });
    return;
  }
  next();
}
