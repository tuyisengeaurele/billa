import { describe, expect, it } from "vitest";
import { createImpersonationRequestSchema, overrideImpersonationRequestSchema } from "./impersonation-schemas.js";

describe("createImpersonationRequestSchema", () => {
  it("accepts a target with an optional reason", () => {
    expect(createImpersonationRequestSchema.safeParse({ targetUserId: "u1", reason: "Debugging a bug" }).success).toBe(
      true,
    );
  });

  it("accepts a target with no reason", () => {
    expect(createImpersonationRequestSchema.safeParse({ targetUserId: "u1" }).success).toBe(true);
  });

  it("rejects a missing targetUserId", () => {
    expect(createImpersonationRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("overrideImpersonationRequestSchema", () => {
  it("requires a reason", () => {
    expect(overrideImpersonationRequestSchema.safeParse({ overrideReason: "" }).success).toBe(false);
    expect(overrideImpersonationRequestSchema.safeParse({ overrideReason: "Urgent support" }).success).toBe(true);
  });
});
