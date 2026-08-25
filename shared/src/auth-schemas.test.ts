import { describe, expect, it } from "vitest";
import {
  PASSWORD_REQUIREMENTS,
  disableTwoFactorSchema,
  sessionSchema,
  totpCodeSchema,
  twoFactorChallengeSchema,
} from "./auth-schemas.js";

describe("sessionSchema", () => {
  it("accepts an idToken with no businessName", () => {
    expect(sessionSchema.safeParse({ idToken: "token123" }).success).toBe(true);
  });

  it("accepts an idToken with a businessName", () => {
    expect(sessionSchema.safeParse({ idToken: "token123", businessName: "Kigali Traders" }).success).toBe(true);
  });

  it("rejects a missing idToken", () => {
    expect(sessionSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an empty idToken", () => {
    expect(sessionSchema.safeParse({ idToken: "" }).success).toBe(false);
  });
});

describe("totpCodeSchema", () => {
  it("accepts a 6-digit code", () => {
    expect(totpCodeSchema.safeParse({ code: "123456" }).success).toBe(true);
  });

  it("rejects a code with letters", () => {
    expect(totpCodeSchema.safeParse({ code: "12345A" }).success).toBe(false);
  });

  it("rejects a code that isn't 6 digits", () => {
    expect(totpCodeSchema.safeParse({ code: "12345" }).success).toBe(false);
  });
});

describe("twoFactorChallengeSchema", () => {
  it("accepts a 6-digit TOTP code with a challengeId", () => {
    expect(twoFactorChallengeSchema.safeParse({ challengeId: "c1", code: "123456" }).success).toBe(true);
  });

  it("accepts a 10-character backup code", () => {
    expect(twoFactorChallengeSchema.safeParse({ challengeId: "c1", code: "A1B2C3D4E5" }).success).toBe(true);
  });

  it("rejects a missing challengeId", () => {
    expect(twoFactorChallengeSchema.safeParse({ code: "123456" }).success).toBe(false);
  });
});

describe("disableTwoFactorSchema", () => {
  it("accepts a valid code", () => {
    expect(disableTwoFactorSchema.safeParse({ code: "123456" }).success).toBe(true);
  });

  it("rejects an empty code", () => {
    expect(disableTwoFactorSchema.safeParse({ code: "" }).success).toBe(false);
  });
});

describe("PASSWORD_REQUIREMENTS", () => {
  const STRONG_PASSWORD = "Supersecret1!";

  it("every requirement is met by a strong password", () => {
    for (const requirement of PASSWORD_REQUIREMENTS) {
      expect(requirement.test(STRONG_PASSWORD)).toBe(true);
    }
  });

  it("an empty string fails every requirement", () => {
    for (const requirement of PASSWORD_REQUIREMENTS) {
      expect(requirement.test("")).toBe(false);
    }
  });
});
