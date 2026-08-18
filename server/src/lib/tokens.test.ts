import { beforeEach, describe, expect, it } from "vitest";
import { generateRefreshToken, hashRefreshToken, signAccessToken, verifyAccessToken } from "./tokens.js";

beforeEach(() => {
  process.env.JWT_ACCESS_SECRET = "test-secret";
});

describe("access tokens", () => {
  it("round-trips a valid payload", () => {
    const token = signAccessToken({ userId: "u1", businessId: "b1" });
    const payload = verifyAccessToken(token);
    expect(payload).toMatchObject({ userId: "u1", businessId: "b1" });
  });

  it("rejects a tampered token", () => {
    const token = signAccessToken({ userId: "u1", businessId: "b1" });
    expect(verifyAccessToken(token + "x")).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signAccessToken({ userId: "u1", businessId: "b1" });
    process.env.JWT_ACCESS_SECRET = "different-secret";
    expect(verifyAccessToken(token)).toBeNull();
  });
});

describe("refresh tokens", () => {
  it("hashes the same token to the same value", () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
  });

  it("generates unique tokens", () => {
    expect(generateRefreshToken()).not.toBe(generateRefreshToken());
  });
});
