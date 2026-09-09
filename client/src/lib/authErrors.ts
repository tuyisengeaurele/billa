import { ApiError } from "./apiClient";

// /auth/session and /auth/2fa/challenge are rate-limited server-side (10 attempts
// per 15 minutes) to slow down credential-stuffing - a real person hitting that
// during ordinary testing (repeated logins, retrying after fixing something) saw
// the exact same "Something went wrong" as every other failure, with no hint that
// retrying immediately would just fail again for the same reason.
export const RATE_LIMITED_MESSAGE = "Too many attempts. Wait a few minutes and try again.";

export function isRateLimited(err: unknown): boolean {
  return err instanceof ApiError && err.status === 429;
}

// A real, reachable account state: every business this account belonged to was
// left or deleted, or it's an admin-only account that was never given one.
export const NO_BUSINESS_ACCESS_MESSAGE = "This account isn't linked to a business. Contact support for help.";

export function hasNoBusinessAccess(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 403 &&
    typeof err.body === "object" &&
    err.body !== null &&
    (err.body as { error?: string }).error === "no_business_access"
  );
}
