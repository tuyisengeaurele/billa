import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user || !user.isAdmin) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  // Admin routes reach every business's data - a password alone (or whatever a
  // password-reset email compromises) shouldn't be enough to use them. Two-factor
  // is available to any account from Profile; admins are just the ones required to
  // actually turn it on before the admin panel will accept them.
  if (!user.totpEnabled) {
    res.status(403).json({ error: "admin_requires_2fa" });
    return;
  }
  next();
}
