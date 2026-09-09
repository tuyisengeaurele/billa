import type { CookieOptions, Response } from "express";

const isProd = process.env.NODE_ENV === "production";

// The client and API are the same origin in every environment now (see app.ts:
// the built client is served from this same Express process in production; in
// local dev, localhost:5173 and localhost:4000 are same-site even though they're
// different ports) - Lax is not just sufficient, it's the more secure choice
// once None isn't actually required for anything to work. This used to be
// SameSite=None in production, back when the client and API were two separate
// onrender.com subdomains - genuinely cross-site to a browser (onrender.com is on
// the public suffix list), which meant Incognito (and an increasing share of
// regular Chrome) silently dropped every auth cookie. None is dormant here, not
// deleted, in case a future deploy ever splits the two services again.
const sameSite: CookieOptions["sameSite"] = "lax";

export function setAccessTokenCookie(res: Response, token: string) {
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite,
    path: "/",
    maxAge: 15 * 60 * 1000,
  });
}

export function setRefreshTokenCookie(res: Response, token: string, maxAgeMs: number) {
  res.cookie("refresh_token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite,
    path: "/auth/refresh",
    maxAge: maxAgeMs,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie("access_token", { path: "/", secure: isProd, sameSite });
  res.clearCookie("refresh_token", { path: "/auth/refresh", secure: isProd, sameSite });
}
