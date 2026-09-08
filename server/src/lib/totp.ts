import crypto from "node:crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { decryptWithKey, encryptWithKey } from "./encryption.js";

const TOTP_KEY_ENV = "TOTP_SECRET_ENCRYPTION_KEY";

// A TOTP secret is a long-lived credential: anyone who reads it can generate valid
// codes forever, so it's encrypted at rest under its own key (never the MoMo one).
export function encryptTotpSecret(secret: string): string {
  return encryptWithKey(secret, TOTP_KEY_ENV);
}

// Accounts that enabled 2FA before secrets were encrypted at rest have a plaintext
// value stored (base32, never contains a colon); encrypted values are always three
// hex segments joined by colons, so that shape is enough to tell them apart.
export function decryptTotpSecret(stored: string): string {
  if (stored.split(":").length !== 3) {
    return stored;
  }
  try {
    return decryptWithKey(stored, TOTP_KEY_ENV);
  } catch {
    return stored;
  }
}

export interface TotpSetup {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUri: string;
}

export async function generateTotpSetup(accountLabel: string): Promise<TotpSetup> {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(accountLabel, "Billa", secret);
  const qrCodeDataUri = await QRCode.toDataURL(otpauthUrl);
  return { secret, otpauthUrl, qrCodeDataUri };
}

export function verifyTotpToken(token: string, secret: string): boolean {
  try {
    return authenticator.check(token, secret);
  } catch {
    return false;
  }
}

const BACKUP_CODE_COUNT = 8;

export function hashBackupCode(code: string): string {
  return crypto.createHash("sha256").update(code.toUpperCase().trim()).digest("hex");
}

export function generateBackupCodes(): { plaintext: string[]; hashed: string[] } {
  const plaintext = Array.from({ length: BACKUP_CODE_COUNT }, () => crypto.randomBytes(5).toString("hex").toUpperCase());
  const hashed = plaintext.map(hashBackupCode);
  return { plaintext, hashed };
}
