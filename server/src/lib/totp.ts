import crypto from "node:crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";

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
