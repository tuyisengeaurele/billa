import type { Request } from "express";
import rateLimit from "express-rate-limit";

const isTest = process.env.NODE_ENV === "test";

// Keyed by user, not IP, wherever we can: an office full of staff sharing one IP
// should never rate-limit each other, and a signed-in user switching networks (wifi
// to mobile data) should keep the same budget. Falls back to IP only for the rare
// authenticated route hit before requireAuth has run.
function keyByUserOrIp(req: Request): string {
  return req.auth?.userId ?? req.ip ?? "unknown";
}

export function createGeneralApiRateLimit(limit: number, windowMs = 60 * 1000) {
  return rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, keyGenerator: keyByUserOrIp });
}

// Generous enough that fast, ordinary use (clicking through documents, search-as-you-type,
// the notification/impersonation pollers) never comes close - this exists to cap a
// scripted scrape or a buggy client retry loop, not to throttle a busy real user.
export const generalApiRateLimit = createGeneralApiRateLimit(isTest ? 100000 : 300);

// CSV export and report generation read every row in a business's data, not one page
// of it - much more expensive per request than ordinary CRUD, so it gets its own,
// tighter budget.
export const expensiveOperationRateLimit = createGeneralApiRateLimit(isTest ? 100000 : 20);
