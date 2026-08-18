import type { Response } from "express";

const isProd = process.env.NODE_ENV === "production";

export function setAccessTokenCookie(res: Response, token: string) {
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60 * 1000,
  });
}

export function setRefreshTokenCookie(res: Response, token: string, maxAgeMs: number) {
  res.cookie("refresh_token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/auth/refresh",
    maxAge: maxAgeMs,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie("access_token", { path: "/" });
  res.clearCookie("refresh_token", { path: "/auth/refresh" });
}
