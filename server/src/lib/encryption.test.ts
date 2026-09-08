import { beforeEach, describe, expect, it } from "vitest";
import { encrypt, decrypt } from "./encryption.js";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

beforeEach(() => {
  process.env.MOMO_CREDENTIALS_ENCRYPTION_KEY = TEST_KEY;
});

describe("encrypt/decrypt", () => {
  it("round-trips a plaintext string", () => {
    const ciphertext = encrypt("super-secret-api-key");

    expect(ciphertext).not.toContain("super-secret-api-key");
    expect(decrypt(ciphertext)).toBe("super-secret-api-key");
  });

  it("produces a different ciphertext each time, since the IV is random", () => {
    const a = encrypt("same-value");
    const b = encrypt("same-value");

    expect(a).not.toBe(b);
  });

  it("throws when the ciphertext has been tampered with", () => {
    const ciphertext = encrypt("super-secret-api-key");
    const [iv, authTag, body] = ciphertext.split(":");
    const tampered = `${iv}:${authTag}:${body.slice(0, -2)}00`;

    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws when decrypting with the wrong key", () => {
    const ciphertext = encrypt("super-secret-api-key");
    process.env.MOMO_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");

    expect(() => decrypt(ciphertext)).toThrow();
  });

  it("throws when the encryption key env var is not set", () => {
    delete process.env.MOMO_CREDENTIALS_ENCRYPTION_KEY;

    expect(() => encrypt("value")).toThrow("MOMO_CREDENTIALS_ENCRYPTION_KEY is not set");
  });
});
