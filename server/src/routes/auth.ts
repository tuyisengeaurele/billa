import crypto from "node:crypto";
import { Router } from "express";
import { sessionSchema } from "@billa/shared";
import type { SessionInput } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { verifyFirebaseToken } from "../lib/firebase-admin.js";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "../lib/tokens.js";
import { ttlToMs } from "../lib/ttl.js";
import { clearAuthCookies, setAccessTokenCookie, setRefreshTokenCookie } from "../lib/cookies.js";
import { validateBody } from "../middleware/validate.js";
import { authRateLimit } from "../middleware/auth-rate-limit.js";
import { requireAuth } from "../middleware/require-auth.js";

export const authRouter = Router();

function refreshTtlMs(): number {
  return ttlToMs(process.env.JWT_REFRESH_TTL ?? "30d");
}

async function issueSession(res: Parameters<typeof setAccessTokenCookie>[0], userId: string, businessId: string) {
  const accessToken = signAccessToken({ userId, businessId });
  const refreshToken = generateRefreshToken();
  const ttlMs = refreshTtlMs();

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      family: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });

  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, refreshToken, ttlMs);
}

authRouter.post("/session", authRateLimit, validateBody(sessionSchema), async (req, res) => {
  const { idToken, businessName } = req.body as SessionInput;

  let firebaseUser: { uid: string; email: string };
  try {
    firebaseUser = await verifyFirebaseToken(idToken);
  } catch {
    res.status(401).json({ error: "invalid_token" });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { firebaseUid: firebaseUser.uid } });
  if (existing) {
    const business = await prisma.business.findUnique({ where: { id: existing.businessId } });
    await issueSession(res, existing.id, existing.businessId);
    res.json({
      user: { id: existing.id, email: existing.email },
      business: { id: business!.id, name: business!.name },
    });
    return;
  }

  if (!businessName) {
    res.status(404).json({ error: "no_account" });
    return;
  }

  const { user, business } = await prisma.$transaction(async (tx) => {
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const business = await tx.business.create({ data: { name: businessName, trialEndsAt } });
    const user = await tx.user.create({
      data: { email: firebaseUser.email, firebaseUid: firebaseUser.uid, businessId: business.id },
    });
    return { user, business };
  });

  await issueSession(res, user.id, business.id);
  res.status(201).json({
    user: { id: user.id, email: user.email },
    business: { id: business.id, name: business.name },
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    include: { business: true },
  });
  if (!user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  res.json({
    user: { id: user.id, email: user.email },
    business: { id: user.business.id, name: user.business.name },
  });
});

authRouter.post("/refresh", async (req, res) => {
  const presented = req.cookies?.refresh_token;
  if (!presented) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const presentedHash = hashRefreshToken(presented);
  const stored = await prisma.refreshToken.findFirst({ where: { tokenHash: presentedHash } });

  if (!stored) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { family: stored.family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    res.status(401).json({ error: "token_reuse_detected" });
    return;
  }

  if (stored.expiresAt < new Date()) {
    res.status(401).json({ error: "expired" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const accessToken = signAccessToken({ userId: user.id, businessId: user.businessId });
  const newRefreshToken = generateRefreshToken();
  const ttlMs = refreshTtlMs();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(newRefreshToken),
      family: stored.family,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });

  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, newRefreshToken, ttlMs);
  res.json({ ok: true });
});

authRouter.post("/logout", async (req, res) => {
  const presented = req.cookies?.refresh_token;
  if (presented) {
    const presentedHash = hashRefreshToken(presented);
    await prisma.refreshToken.updateMany({
      where: { tokenHash: presentedHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  clearAuthCookies(res);
  res.json({ ok: true });
});
