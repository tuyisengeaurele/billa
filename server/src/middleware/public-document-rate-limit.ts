import rateLimit from "express-rate-limit";

// These endpoints are unauthenticated (reached via a public document/portal link), so
// nothing but the token itself gates them. The token is a UUID (effectively unguessable),
// so this isn't about brute-forcing it - it's about capping how much expensive work
// (headless-browser PDF rendering, real MTN MoMo API calls) one IP can trigger.

export function createPublicDocumentRateLimit(limit: number, windowMs: number) {
  return rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false });
}

const isTest = process.env.NODE_ENV === "test";

// Viewing/downloading/accepting/declining a single document, or starting a MoMo
// request, happens a handful of times per real customer visit - generous enough to
// cover a shared office link being opened by several people, plus a few reloads.
export const publicDocumentRateLimit = createPublicDocumentRateLimit(isTest ? 1000 : 60, 15 * 60 * 1000);

// The client polls MoMo payment status every 3s for up to the request's expiry
// window, so a single legitimate payment can account for ~100 requests on its own.
export const momoPollRateLimit = createPublicDocumentRateLimit(isTest ? 1000 : 150, 5 * 60 * 1000);
