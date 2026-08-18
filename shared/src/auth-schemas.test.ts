import { describe, expect, it } from "vitest";
import { loginSchema, PASSWORD_REQUIREMENTS, registerSchema } from "./auth-schemas.js";

const STRONG_PASSWORD = "Supersecret1!";

function issueMessages(result: ReturnType<typeof registerSchema.safeParse>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("registerSchema", () => {
  it("accepts a valid payload", () => {
    const result = registerSchema.safeParse({
      email: "owner@example.com",
      password: STRONG_PASSWORD,
      businessName: "Kigali Traders",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email with a friendly message", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: STRONG_PASSWORD,
      businessName: "Kigali Traders",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Enter a valid email address");
    }
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({
      email: "owner@example.com",
      password: "Ab1!",
      businessName: "Kigali Traders",
    });
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain("Password must be at least 8 characters");
  });

  it("rejects a password missing a lowercase letter", () => {
    const result = registerSchema.safeParse({
      email: "owner@example.com",
      password: "SUPERSECRET1!",
      businessName: "Kigali Traders",
    });
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain("Password must include a lowercase letter");
  });

  it("rejects a password missing an uppercase letter", () => {
    const result = registerSchema.safeParse({
      email: "owner@example.com",
      password: "supersecret1!",
      businessName: "Kigali Traders",
    });
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain("Password must include an uppercase letter");
  });

  it("rejects a password missing a number", () => {
    const result = registerSchema.safeParse({
      email: "owner@example.com",
      password: "Supersecret!",
      businessName: "Kigali Traders",
    });
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain("Password must include a number");
  });

  it("rejects a password missing a special character", () => {
    const result = registerSchema.safeParse({
      email: "owner@example.com",
      password: "Supersecret1",
      businessName: "Kigali Traders",
    });
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain("Password must include a special character");
  });

  it("rejects an empty business name with a friendly message", () => {
    const result = registerSchema.safeParse({
      email: "owner@example.com",
      password: STRONG_PASSWORD,
      businessName: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Enter your business name");
    }
  });
});

describe("loginSchema", () => {
  it("accepts a valid payload", () => {
    const result = loginSchema.safeParse({ email: "owner@example.com", password: "anything" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing password with a friendly message", () => {
    const result = loginSchema.safeParse({ email: "owner@example.com", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Enter your password");
    }
  });
});

describe("PASSWORD_REQUIREMENTS", () => {
  it("every requirement is met by the shared strong password fixture", () => {
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
