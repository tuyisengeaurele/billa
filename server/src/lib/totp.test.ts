import { describe, expect, it } from "vitest";
import { authenticator } from "otplib";
import { generateBackupCodes, generateTotpSetup, hashBackupCode, verifyTotpToken } from "./totp.js";

describe("generateTotpSetup", () => {
  it("returns a secret, an otpauth URL, and a scannable QR code data URI", async () => {
    const setup = await generateTotpSetup("owner@example.com");

    expect(setup.secret).toMatch(/^[A-Z2-7]+$/);
    expect(setup.otpauthUrl).toContain("otpauth://totp/");
    expect(setup.otpauthUrl).toContain("Billa");
    expect(setup.qrCodeDataUri).toMatch(/^data:image\/png;base64,/);
  });
});

describe("verifyTotpToken", () => {
  it("accepts a token generated from the same secret", async () => {
    const { secret } = await generateTotpSetup("owner@example.com");
    const token = authenticator.generate(secret);

    expect(verifyTotpToken(token, secret)).toBe(true);
  });

  it("rejects a wrong token", async () => {
    const { secret } = await generateTotpSetup("owner@example.com");

    expect(verifyTotpToken("000000", secret)).toBe(false);
  });

  it("rejects malformed input instead of throwing", () => {
    expect(verifyTotpToken("not-a-code", "also-not-a-secret")).toBe(false);
  });
});

describe("generateBackupCodes", () => {
  it("generates 8 unique plaintext codes with matching hashes", () => {
    const { plaintext, hashed } = generateBackupCodes();

    expect(plaintext).toHaveLength(8);
    expect(hashed).toHaveLength(8);
    expect(new Set(plaintext).size).toBe(8);
    expect(hashed[0]).toBe(hashBackupCode(plaintext[0]));
  });
});

describe("hashBackupCode", () => {
  it("is case-insensitive and trims whitespace", () => {
    expect(hashBackupCode("abc123")).toBe(hashBackupCode(" ABC123 "));
  });
});
