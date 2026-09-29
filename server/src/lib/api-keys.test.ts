import { describe, expect, it } from "vitest";
import { API_KEY_PREFIX, generateApiKey, hashApiKey, looksLikeApiKey } from "./api-keys.js";

describe("generateApiKey", () => {
  it("makes a prefixed key whose hash and display prefix match it", () => {
    const { key, keyHash, keyPrefix } = generateApiKey();

    expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(key.length).toBeGreaterThan(40);
    expect(keyHash).toBe(hashApiKey(key));
    expect(key.startsWith(keyPrefix)).toBe(true);
    expect(keyPrefix.length).toBeLessThan(key.length);
  });

  it("never repeats", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateApiKey().key));
    expect(keys.size).toBe(50);
  });
});

describe("hashApiKey", () => {
  it("is stable and does not contain the key", () => {
    const { key } = generateApiKey();
    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key)).not.toContain(key);
    expect(hashApiKey(key)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("looksLikeApiKey", () => {
  it("accepts a generated key and rejects anything else", () => {
    expect(looksLikeApiKey(generateApiKey().key)).toBe(true);
    expect(looksLikeApiKey("eyJhbGciOi.jwt.token")).toBe(false);
    expect(looksLikeApiKey("")).toBe(false);
  });
});
