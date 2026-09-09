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
  // where client and server share a site (same host, different port) so Secure
  // isn't needed (plain HTTP can't set it anyway).
  it("uses SameSite=Lax and no Secure flag outside production", () => {
    const res = fakeRes();
    setAccessTokenCookie(res, "abc");
    expect(res.cookie).toHaveBeenCalledWith(
      "access_token",
      "abc",
      expect.objectContaining({ sameSite: "lax", secure: false }),
    );
  });

  it("still uses SameSite=Lax in production, now that the client and API are the same origin", async () => {
    // Regression test: this used to be SameSite=None here, back when the client
    // and API were two separate onrender.com subdomains (genuinely cross-site) -
    // that's what got silently dropped by Incognito and an increasing share of
    // regular Chrome traffic. Isolated module import so the isProd flag this
    // module captures at load time reflects NODE_ENV=production, not the "test"
    // every other test in this file (and the whole suite) runs under.
    vi.resetModules();
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const { setAccessTokenCookie: setAccessTokenCookieInProd } = await import("./cookies.js");
      const res = fakeRes();
      setAccessTokenCookieInProd(res, "abc");
      expect(res.cookie).toHaveBeenCalledWith(
        "access_token",
        "abc",
        expect.objectContaining({ sameSite: "lax", secure: true }),
      );
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      vi.resetModules();
    }
  });
});
