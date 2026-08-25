import { Router } from "express";
import {
  disableTwoFactorSchema,
  sessionSchema,
  switchBusinessSchema,
  totpCodeSchema,
  twoFactorChallengeSchema,
} from "@billa/shared";
import type {
  DisableTwoFactorInput,
  SessionInput,
  SwitchBusinessInput,
  TotpCodeInput,
  TwoFactorChallengeInput,
} from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { verifyFirebaseToken } from "../lib/firebase-admin.js";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "../lib/tokens.js";
import { ttlToMs } from "../lib/ttl.js";
import { clearAuthCookies, setAccessTokenCookie, setRefreshTokenCookie } from "../lib/cookies.js";
import { issueSession } from "../lib/session.js";
import { generateBackupCodes, generateTotpSetup, hashBackupCode, verifyTotpToken } from "../lib/totp.js";
import { validateBody } from "../middleware/validate.js";
import { authRateLimit } from "../middleware/auth-rate-limit.js";
import { requireAuth } from "../middleware/require-auth.js";

const TWO_FACTOR_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export const authRouter = Router();

function refreshTtlMs(): number {
  return ttlToMs(process.env.JWT_REFRESH_TTL ?? "30d");
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
    let businessId = existing.lastActiveBusinessId;
    if (!businessId) {
      const firstBusiness = await prisma.business.findFirstOrThrow({
        where: { ownerId: existing.id },
        orderBy: { createdAt: "asc" },
      });
      businessId = firstBusiness.id;
    }
    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });

    if (existing.totpEnabled) {
      const challenge = await prisma.twoFactorChallenge.create({
        data: {
          userId: existing.id,
          businessId,
          expiresAt: new Date(Date.now() + TWO_FACTOR_CHALLENGE_TTL_MS),
        },
      });
      res.json({ twoFactorRequired: true, challengeId: challenge.id });
      return;
    }

    await issueSession(res, existing.id, businessId);
    res.json({
      user: { id: existing.id, email: existing.email, totpEnabled: existing.totpEnabled },
      business: { id: business.id, name: business.name, onboardingCompletedAt: business.onboardingCompletedAt },
    });
    return;
  }

  if (!businessName) {
    res.status(404).json({ error: "no_account" });
    return;
  }

  const { user, business } = await prisma.$transaction(async (tx) => {
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const user = await tx.user.create({
      data: { email: firebaseUser.email, firebaseUid: firebaseUser.uid, trialEndsAt },
    });
    const business = await tx.business.create({ data: { name: businessName, ownerId: user.id } });
    const updatedUser = await tx.user.update({
      where: { id: user.id },
      data: { lastActiveBusinessId: business.id },
    });
    return { user: updatedUser, business };
  });

  await issueSession(res, user.id, business.id);
  res.status(201).json({
    user: { id: user.id, email: user.email, totpEnabled: user.totpEnabled },
    business: { id: business.id, name: business.name, onboardingCompletedAt: business.onboardingCompletedAt },
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const business = await prisma.business.findUnique({ where: { id: req.auth!.businessId } });
  if (!business) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  res.json({
    user: { id: user.id, email: user.email, totpEnabled: user.totpEnabled },
    business: { id: business.id, name: business.name, onboardingCompletedAt: business.onboardingCompletedAt },
  });
});

authRouter.post("/switch-business", requireAuth, validateBody(switchBusinessSchema), async (req, res) => {
  const { businessId } = req.body as SwitchBusinessInput;
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business || business.ownerId !== req.auth!.userId) {
    res.status(403).json({ error: "not_owner" });
    return;
  }
  await prisma.user.update({ where: { id: req.auth!.userId }, data: { lastActiveBusinessId: businessId } });
  await issueSession(res, req.auth!.userId, businessId);
  res.json({ business: { id: business.id, name: business.name, onboardingCompletedAt: business.onboardingCompletedAt } });
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

  const accessToken = signAccessToken({ userId: user.id, businessId: stored.businessId });
  const newRefreshToken = generateRefreshToken();
  const ttlMs = refreshTtlMs();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      businessId: stored.businessId,
      tokenHash: hashRefreshToken(newRefreshToken),
      family: stored.family,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });

  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, newRefreshToken, ttlMs);
  res.json({ ok: true });
});

authRouter.post("/2fa/setup", requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
  const setup = await generateTotpSetup(user.email);
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: setup.secret, totpEnabled: false },
  });
  res.json({ secret: setup.secret, otpauthUrl: setup.otpauthUrl, qrCodeDataUri: setup.qrCodeDataUri });
});

authRouter.post("/2fa/verify", requireAuth, validateBody(totpCodeSchema), async (req, res) => {
  const { code } = req.body as TotpCodeInput;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });

  if (!user.totpSecret || !verifyTotpToken(code, user.totpSecret)) {
    res.status(400).json({ error: "invalid_code" });
    return;
  }

  const { plaintext, hashed } = generateBackupCodes();
  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: true, totpBackupCodes: hashed },
  });
  res.json({ backupCodes: plaintext });
});

authRouter.post("/2fa/disable", requireAuth, validateBody(disableTwoFactorSchema), async (req, res) => {
  const { code } = req.body as DisableTwoFactorInput;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });

  if (!user.totpEnabled || !user.totpSecret) {
    res.status(409).json({ error: "not_enabled" });
    return;
  }

  const isValidTotp = verifyTotpToken(code, user.totpSecret);
  const isValidBackup = user.totpBackupCodes.includes(hashBackupCode(code));
  if (!isValidTotp && !isValidBackup) {
    res.status(400).json({ error: "invalid_code" });
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: false, totpSecret: null, totpBackupCodes: [] },
  });
  res.json({ ok: true });
});

authRouter.post("/2fa/challenge", authRateLimit, validateBody(twoFactorChallengeSchema), async (req, res) => {
  const { challengeId, code } = req.body as TwoFactorChallengeInput;

  const challenge = await prisma.twoFactorChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge || challenge.expiresAt < new Date()) {
    res.status(401).json({ error: "invalid_challenge" });
    return;
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: challenge.userId } });
  const isValidTotp = user.totpSecret ? verifyTotpToken(code, user.totpSecret) : false;
  const codeHash = hashBackupCode(code);
  const backupIndex = user.totpBackupCodes.indexOf(codeHash);
  const isValidBackup = backupIndex !== -1;

  if (!isValidTotp && !isValidBackup) {
    res.status(401).json({ error: "invalid_code" });
    return;
  }

  await prisma.twoFactorChallenge.delete({ where: { id: challengeId } });

  if (isValidBackup) {
    const remainingCodes = [...user.totpBackupCodes];
    remainingCodes.splice(backupIndex, 1);
    await prisma.user.update({ where: { id: user.id }, data: { totpBackupCodes: remainingCodes } });
  }

  const business = await prisma.business.findUniqueOrThrow({ where: { id: challenge.businessId } });
  await issueSession(res, user.id, challenge.businessId);
  res.json({
    user: { id: user.id, email: user.email, totpEnabled: user.totpEnabled },
    business: { id: business.id, name: business.name, onboardingCompletedAt: business.onboardingCompletedAt },
  });
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
