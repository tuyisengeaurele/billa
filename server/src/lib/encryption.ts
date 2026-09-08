import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

function getKey(envVarName: string): Buffer {
  const raw = process.env[envVarName];
  if (!raw) {
    throw new Error(`${envVarName} is not set`);
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`${envVarName} must decode to exactly 32 bytes`);
  }
  return key;
}

// Different secret classes (MoMo credentials, TOTP seeds, ...) are encrypted under their
// own key so rotating or leaking one never exposes the others.
export function encryptWithKey(plaintext: string, envVarName: string): string {
  const key = getKey(envVarName);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptWithKey(stored: string, envVarName: string): string {
  const key = getKey(envVarName);
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted value");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

const MOMO_KEY_ENV = "MOMO_CREDENTIALS_ENCRYPTION_KEY";

export function encrypt(plaintext: string): string {
  return encryptWithKey(plaintext, MOMO_KEY_ENV);
}

export function decrypt(stored: string): string {
  return decryptWithKey(stored, MOMO_KEY_ENV);
}
