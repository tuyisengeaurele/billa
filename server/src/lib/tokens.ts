import crypto from "node:crypto";
import jwt from "jsonwebtoken";

export interface AccessTokenPayload {
  userId: string;
  businessId: string;
}

function accessTokenSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is not set");
  }
  return secret;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const ttl = process.env.JWT_ACCESS_TTL ?? "15m";
  return jwt.sign(payload, accessTokenSecret(), {
    expiresIn: ttl as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    return jwt.verify(token, accessTokenSecret()) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
