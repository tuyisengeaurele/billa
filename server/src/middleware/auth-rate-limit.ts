import rateLimit from "express-rate-limit";

export function createAuthRateLimit(limit: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

// Integration tests legitimately register many independent sessions per file
// (each test needs its own isolated user). A limit of 10 real login attempts
// per 15 minutes is the right production value but too tight to share across
// a growing test file, so tests get a much higher ceiling; the exact
// production threshold is verified in isolation in auth-rate-limit.test.ts.
export const authRateLimit = createAuthRateLimit(process.env.NODE_ENV === "test" ? 1000 : 10);
