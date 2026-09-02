import { describe, expect, it } from "vitest";
import { updateProfileSchema } from "./profile-schemas.js";

describe("updateProfileSchema", () => {
  it("accepts a trimmed non-empty name", () => {
    expect(updateProfileSchema.safeParse({ name: "Ange Aurele" }).success).toBe(true);
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(updateProfileSchema.safeParse({ name: "" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name over 100 characters", () => {
    expect(updateProfileSchema.safeParse({ name: "a".repeat(101) }).success).toBe(false);
  });

  it("accepts an optional phone number", () => {
    expect(updateProfileSchema.safeParse({ name: "Ange Aurele", phone: "+250788000000" }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ name: "Ange Aurele" }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ name: "Ange Aurele", phone: null }).success).toBe(true);
  });

  it("rejects a blank phone string", () => {
    expect(updateProfileSchema.safeParse({ name: "Ange Aurele", phone: "" }).success).toBe(false);
  });
});
