import type { Request } from "express";
import rateLimit from "express-rate-limit";

// Signing in and creating an account share one endpoint. Only a request that asks for a new business
// or accepts an invite is creating something, so only those count here.
export function isAccountCreation(req: Request): boolean {
  const body = req.body as { businessName?: unknown; inviteToken?: unknown } | undefined;
  return Boolean(body?.businessName) || Boolean(body?.inviteToken);
}

export function createSignupRateLimit(limit: number) {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !isAccountCreation(req),
  });
}

// Ten new accounts an hour from one address leaves room for an office or a training session signing up
// together, and still makes farming free trials from one machine slow. The check for this exact value
// is in signup-rate-limit.test.ts, since integration tests create many accounts and need a high ceiling.
export const signupRateLimit = createSignupRateLimit(process.env.NODE_ENV === "test" ? 1000 : 10);
