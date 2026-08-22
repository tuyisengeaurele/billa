import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user || !adminEmails().includes(user.email.toLowerCase())) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
}
