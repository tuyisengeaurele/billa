import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user || !user.isAdmin) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
}
