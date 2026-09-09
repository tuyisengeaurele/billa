import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { clearAuthCookies, setAccessTokenCookie, setRefreshTokenCookie } from "./cookies.js";

function fakeRes() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response;
}

describe("cookie helpers", () => {
  it("sets the access token cookie as httpOnly on path /", () => {
    const res = fakeRes();
    setAccessTokenCookie(res, "abc");
    expect(res.cookie).toHaveBeenCalledWith(
      "access_token",
      "abc",
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
  });

  it("sets the refresh token cookie scoped to /auth/refresh", () => {
    const res = fakeRes();
    setRefreshTokenCookie(res, "def", 1000);
    expect(res.cookie).toHaveBeenCalledWith(
      "refresh_token",
      "def",
      expect.objectContaining({ httpOnly: true, path: "/auth/refresh", maxAge: 1000 }),
    );
  });

  it("clears both cookies on their respective paths", () => {
    const res = fakeRes();
    clearAuthCookies(res);
    expect(res.clearCookie).toHaveBeenCalledWith(
      "access_token",
      expect.objectContaining({ path: "/" }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      "refresh_token",
      expect.objectContaining({ path: "/auth/refresh" }),
    );
  });

  // NODE_ENV is "test" here, not "production" - same code path local dev runs under,
  // where client and server share a site (same host, different port) so Lax is
  // correct and Secure isn't needed. Production (a genuinely cross-site deploy) uses
  // the same isProd-derived branch to get SameSite=None + Secure instead.
  it("uses SameSite=Lax and no Secure flag outside production", () => {
    const res = fakeRes();
    setAccessTokenCookie(res, "abc");
    expect(res.cookie).toHaveBeenCalledWith(
      "access_token",
      "abc",
      expect.objectContaining({ sameSite: "lax", secure: false }),
    );
  });
});
