import { describe, expect, it } from "vitest";
import { ApiError } from "./apiClient";
import { hasNoBusinessAccess, isRateLimited } from "./authErrors";

describe("isRateLimited", () => {
  it("is true for a 429 ApiError", () => {
    expect(isRateLimited(new ApiError(429, { error: "rate_limited" }))).toBe(true);
  });

  it("is false for any other status or error shape", () => {
    expect(isRateLimited(new ApiError(500, {}))).toBe(false);
    expect(isRateLimited(new Error("network error"))).toBe(false);
  });
});

describe("hasNoBusinessAccess", () => {
  it("is true for a 403 with the no_business_access error code", () => {
    expect(hasNoBusinessAccess(new ApiError(403, { error: "no_business_access" }))).toBe(true);
  });

  it("is false for a different 403 error code, or a non-403 status", () => {
    expect(hasNoBusinessAccess(new ApiError(403, { error: "account_suspended" }))).toBe(false);
    expect(hasNoBusinessAccess(new ApiError(404, { error: "no_business_access" }))).toBe(false);
    expect(hasNoBusinessAccess(new Error("network error"))).toBe(false);
  });
});
