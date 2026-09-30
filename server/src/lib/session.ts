import crypto from "node:crypto";
import type { Request, Response } from "express";
import { prisma } from "./prisma.js";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "./tokens.js";
import { ttlToMs } from "./ttl.js";
import { DEVICE_COOKIE, setAccessTokenCookie, setDeviceCookie, setRefreshTokenCookie } from "./cookies.js";
import { describeDevice } from "./device-name.js";

function refreshTtlMs(): number {
  return ttlToMs(process.env.JWT_REFRESH_TTL ?? "30d");
}

/** The id of the browser or app making this request, if it has signed in before. */
export function requestDeviceId(req: Pick<Request, "cookies">): string | null {
  const id = req.cookies?.[DEVICE_COOKIE];
  return typeof id === "string" && /^[0-9a-f-]{36}$/.test(id) ? id : null;
}

/** What to call the device that made this request: its browser and system, or a name the app sent itself. */
export function requestDeviceName(req: Pick<Request, "get">): string {
  return describeDevice(req.get("user-agent"), req.get("x-billa-device"));
}

/**
 * Signs the user in on this device. A device only ever holds one session: any session the same
 * user already has here (an earlier sign-in, the one from before a business switch) is ended first.
 */
export async function issueSession(
  req: Pick<Request, "cookies" | "get">,
  res: Response,
  userId: string,
  businessId: string,
  impersonatedBy?: string,
) {
  const accessToken = signAccessToken({ userId, businessId, impersonatedBy });
  const refreshToken = generateRefreshToken();
  const ttlMs = refreshTtlMs();
  const deviceId = requestDeviceId(req) ?? crypto.randomUUID();

  await prisma.$transaction([
    prisma.refreshToken.updateMany({
      where: { userId, deviceId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        userId,
        businessId,
        tokenHash: hashRefreshToken(refreshToken),
        family: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + ttlMs),
        impersonatedBy,
        deviceId,
        deviceName: requestDeviceName(req),
      },
    }),
  ]);

  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, refreshToken, ttlMs);
  setDeviceCookie(res, deviceId);
}
