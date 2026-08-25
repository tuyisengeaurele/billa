import { describe, expect, it } from "vitest";
import { createBusinessSchema, createInviteSchema, switchBusinessSchema } from "./multi-business-schemas.js";

describe("switchBusinessSchema", () => {
  it("accepts a non-empty businessId", () => {
    expect(switchBusinessSchema.safeParse({ businessId: "biz1" }).success).toBe(true);
  });

  it("rejects an empty businessId", () => {
    expect(switchBusinessSchema.safeParse({ businessId: "" }).success).toBe(false);
  });
});

describe("createBusinessSchema", () => {
  it("accepts a non-empty name", () => {
    expect(createBusinessSchema.safeParse({ name: "Side Hustle" }).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(createBusinessSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("createInviteSchema", () => {
  it("accepts a valid email", () => {
    expect(createInviteSchema.safeParse({ email: "team@example.com" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(createInviteSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });
});
