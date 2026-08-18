import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "./auth-schemas.js";

describe("registerSchema", () => {
  it("accepts a valid payload", () => {
    const result = registerSchema.safeParse({
      email: "owner@example.com",
      password: "supersecret1",
      businessName: "Kigali Traders",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email with a friendly message", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "supersecret1",
      businessName: "Kigali Traders",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Enter a valid email address");
    }
  });

  it("rejects a password shorter than 8 characters with a friendly message", () => {
    const result = registerSchema.safeParse({
      email: "owner@example.com",
      password: "short",
      businessName: "Kigali Traders",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Password must be at least 8 characters");
    }
  });

  it("rejects an empty business name with a friendly message", () => {
    const result = registerSchema.safeParse({
      email: "owner@example.com",
      password: "supersecret1",
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
