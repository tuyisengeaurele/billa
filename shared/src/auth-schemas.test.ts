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

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "supersecret1",
      businessName: "Kigali Traders",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({
      email: "owner@example.com",
      password: "short",
      businessName: "Kigali Traders",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty business name", () => {
    const result = registerSchema.safeParse({
      email: "owner@example.com",
      password: "supersecret1",
      businessName: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a valid payload", () => {
    const result = loginSchema.safeParse({ email: "owner@example.com", password: "anything" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing password", () => {
    const result = loginSchema.safeParse({ email: "owner@example.com", password: "" });
    expect(result.success).toBe(false);
  });
});
