import { createHash, randomBytes } from "node:crypto";

export const API_KEY_PREFIX = "bla_live_";
const DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 4;

export interface GeneratedApiKey {
  // Shown to the person once, when the key is made. Never stored.
  key: string;
  keyHash: string;
  keyPrefix: string;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): GeneratedApiKey {
  const key = `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { key, keyHash: hashApiKey(key), keyPrefix: key.slice(0, DISPLAY_PREFIX_LENGTH) };
}

export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(API_KEY_PREFIX) && value.length > API_KEY_PREFIX.length + 20;
}
