import rateLimit from "express-rate-limit";

export function createContactRateLimit(limit: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

// Integration tests send many contact messages from one address, so they get a much higher ceiling.
// The real production threshold of five messages per fifteen minutes is checked in contact-rate-limit.test.ts.
export const contactRateLimit = createContactRateLimit(process.env.NODE_ENV === "test" ? 1000 : 5);
