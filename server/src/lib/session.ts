import crypto from "node:crypto";
import type { Response } from "express";
import { prisma } from "./prisma.js";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "./tokens.js";
import { ttlToMs } from "./ttl.js";
import { setAccessTokenCookie, setRefreshTokenCookie } from "./cookies.js";

function refreshTtlMs(): number {
  return ttlToMs(process.env.JWT_REFRESH_TTL ?? "30d");
}

export async function issueSession(res: Response, userId: string, businessId: string, impersonatedBy?: string) {
  const accessToken = signAccessToken({ userId, businessId, impersonatedBy });
  const refreshToken = generateRefreshToken();
  const ttlMs = refreshTtlMs();

  await prisma.refreshToken.create({
    data: {
      userId,
      businessId,
      tokenHash: hashRefreshToken(refreshToken),
      family: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });

  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, refreshToken, ttlMs);
}
