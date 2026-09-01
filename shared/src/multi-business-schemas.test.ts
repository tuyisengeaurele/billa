import { describe, expect, it } from "vitest";
import {
  createBusinessSchema,
  createInviteSchema,
  switchBusinessSchema,
  updateMemberRoleSchema,
} from "./multi-business-schemas.js";

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

  it("defaults role to MEMBER when not provided", () => {
    const result = createInviteSchema.parse({ email: "team@example.com" });
    expect(result.role).toBe("MEMBER");
  });

  it("accepts ACCOUNTANT as the invited role", () => {
    const result = createInviteSchema.parse({ email: "team@example.com", role: "ACCOUNTANT" });
    expect(result.role).toBe("ACCOUNTANT");
  });

  it("rejects an unknown role", () => {
    expect(createInviteSchema.safeParse({ email: "team@example.com", role: "SUPERADMIN" }).success).toBe(false);
  });
});

describe("updateMemberRoleSchema", () => {
  it("accepts MEMBER and ACCOUNTANT", () => {
    expect(updateMemberRoleSchema.safeParse({ role: "MEMBER" }).success).toBe(true);
    expect(updateMemberRoleSchema.safeParse({ role: "ACCOUNTANT" }).success).toBe(true);
  });

  it("rejects an unknown role", () => {
    expect(updateMemberRoleSchema.safeParse({ role: "OWNER" }).success).toBe(false);
  });
});
