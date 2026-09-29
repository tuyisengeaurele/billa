import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { hashApiKey, looksLikeApiKey } from "../lib/api-keys.js";

declare global {
  namespace Express {
    interface Request {
      apiKeyId?: string;
    }
  }
}

const LAST_USED_REFRESH_MS = 60 * 1000;

/**
 * Authenticates a request by its `Authorization: Bearer bla_live_...` key and gives it the
 * same `req.auth` shape a browser session has (the business owner acting in that business),
 * so the routers it reaches apply the exact rules the app itself is held to. A browser cookie
 * is deliberately not accepted here.
 */
export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") ?? "");
  if (!match || !looksLikeApiKey(match[1]!)) {
    res.status(401).json({ error: "invalid_api_key" });
    return;
  }

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(match[1]!) },
    include: { business: { select: { ownerId: true } } },
  });
  if (!apiKey || apiKey.revokedAt) {
    res.status(401).json({ error: "invalid_api_key" });
    return;
  }

  // Not on every request: a busy integration would otherwise write a row per call.
  if (!apiKey.lastUsedAt || Date.now() - apiKey.lastUsedAt.getTime() > LAST_USED_REFRESH_MS) {
    await prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });
  }

  req.auth = { userId: apiKey.business.ownerId, businessId: apiKey.businessId };
  req.apiKeyId = apiKey.id;
  next();
}
