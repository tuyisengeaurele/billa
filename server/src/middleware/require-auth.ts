import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/tokens.js";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; businessId: string; impersonatedBy?: string };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Already authenticated earlier in the request, by an API key (see api-key-auth.ts).
  if (req.auth) {
    next();
    return;
  }
  const token = req.cookies?.access_token;
  if (!token) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  req.auth = payload;
  next();
}
