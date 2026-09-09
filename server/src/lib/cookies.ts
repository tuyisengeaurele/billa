import type { CookieOptions, Response } from "express";

const isProd = process.env.NODE_ENV === "production";

// The client and API are deployed on two different onrender.com subdomains, which
// browsers treat as separate sites (onrender.com is on the public suffix list, the
// same reason vercel.app and github.io subdomains are mutually cross-site) - not the
// same-origin-but-different-port relationship local dev has between localhost:5173
// and localhost:4000. A SameSite=Lax cookie is never sent on a cross-site fetch, only
// on a top-level navigation, so every authenticated API call was silently going out
// with no cookie at all and immediately reading as an expired session. SameSite=None
// is the standard fix for a genuinely cross-site frontend/API split - it requires
// Secure, which is exactly why this only applies in production (plain HTTP local dev
// cannot set a Secure cookie at all, and doesn't need to - localhost-to-localhost
// really is same-site).
const sameSite: CookieOptions["sameSite"] = isProd ? "none" : "lax";

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
