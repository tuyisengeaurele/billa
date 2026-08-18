import crypto from "node:crypto";
import { Router } from "express";
import { loginSchema, registerSchema } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "../lib/tokens.js";
import { ttlToMs } from "../lib/ttl.js";
import { setAccessTokenCookie, setRefreshTokenCookie } from "../lib/cookies.js";
import { validateBody } from "../middleware/validate.js";
import { authRateLimit } from "../middleware/auth-rate-limit.js";

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

authRouter.post("/register", authRateLimit, validateBody(registerSchema), async (req, res) => {
  const { email, password, businessName } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "email_taken" });
    return;
  }

  const passwordHash = await hashPassword(password);

  const { user, business } = await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({ data: { name: businessName } });
    const user = await tx.user.create({
      data: { email, passwordHash, businessId: business.id },
    });
    return { user, business };
  });

  await issueSession(res, user.id, business.id);
  res.status(201).json({
    user: { id: user.id, email: user.email },
    business: { id: business.id, name: business.name },
  });
});

authRouter.post("/login", authRateLimit, validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  await issueSession(res, user.id, user.businessId);
  res.json({ user: { id: user.id, email: user.email } });
});
