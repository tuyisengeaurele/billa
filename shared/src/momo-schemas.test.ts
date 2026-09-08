import { describe, expect, it } from "vitest";
import { createMomoPaymentRequestSchema, testMomoSettingsSchema, updateMomoSettingsSchema } from "./momo-schemas.js";

describe("updateMomoSettingsSchema", () => {
  it("accepts a sandbox configuration without a target environment", () => {
    const result = updateMomoSettingsSchema.safeParse({
      enabled: true,
      environment: "sandbox",
      subscriptionKey: "sub-key",
      apiUser: "api-user",
      apiKey: "api-key",
    });

    expect(result.success).toBe(true);
  });

  it("requires a target environment for production", () => {
    const result = updateMomoSettingsSchema.safeParse({
      enabled: true,
      environment: "production",
      subscriptionKey: "sub-key",
      apiUser: "api-user",
      apiKey: "api-key",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a production configuration that includes a target environment", () => {
    const result = updateMomoSettingsSchema.safeParse({
      enabled: true,
      environment: "production",
      targetEnvironment: "abc123",
      subscriptionKey: "sub-key",
      apiUser: "api-user",
      apiKey: "api-key",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unknown environment", () => {
    const result = updateMomoSettingsSchema.safeParse({ enabled: true, environment: "staging" });

    expect(result.success).toBe(false);
  });
});

describe("testMomoSettingsSchema", () => {
  it("accepts an empty body (test the already-saved credentials)", () => {
    expect(testMomoSettingsSchema.safeParse({}).success).toBe(true);
  });

  it("accepts explicit credentials to test before saving", () => {
    const result = testMomoSettingsSchema.safeParse({
      environment: "sandbox",
      subscriptionKey: "sub-key",
      apiUser: "api-user",
      apiKey: "api-key",
    });

    expect(result.success).toBe(true);
  });
});

describe("createMomoPaymentRequestSchema", () => {
  it("accepts a phone number", () => {
    expect(createMomoPaymentRequestSchema.safeParse({ phoneNumber: "250788000000" }).success).toBe(true);
  });

  it("rejects a missing phone number", () => {
    expect(createMomoPaymentRequestSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a phone number that's too short to be real", () => {
    expect(createMomoPaymentRequestSchema.safeParse({ phoneNumber: "12345" }).success).toBe(false);
  });
});
