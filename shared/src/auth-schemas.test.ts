import { describe, expect, it } from "vitest";
import { PASSWORD_REQUIREMENTS, sessionSchema } from "./auth-schemas.js";

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
