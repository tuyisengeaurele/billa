import { describe, expect, it } from "vitest";
import { businessProfileSchema, documentSequenceSchema, updateSequencesSchema } from "./business-schemas.js";

describe("businessProfileSchema", () => {
  it("accepts a partial update", () => {
    const result = businessProfileSchema.safeParse({ tin: "123456789", phone: "+250788000000" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = businessProfileSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty body", () => {
    const result = businessProfileSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("documentSequenceSchema", () => {
  it("accepts a valid entry", () => {
    const result = documentSequenceSchema.safeParse({ type: "INVOICE", prefix: "INV-", nextNumber: 1 });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown type", () => {
    const result = documentSequenceSchema.safeParse({ type: "BANANA", prefix: "INV-", nextNumber: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects a prefix longer than 10 characters", () => {
    const result = documentSequenceSchema.safeParse({
      type: "INVOICE",
      prefix: "WAY-TOO-LONG-",
      nextNumber: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive nextNumber", () => {
    const result = documentSequenceSchema.safeParse({ type: "INVOICE", prefix: "INV-", nextNumber: 0 });
    expect(result.success).toBe(false);
  });
});

describe("updateSequencesSchema", () => {
  it("accepts 1-5 valid entries", () => {
    const result = updateSequencesSchema.safeParse([
      { type: "INVOICE", prefix: "INV-", nextNumber: 1 },
      { type: "QUOTE", prefix: "QTE-", nextNumber: 1 },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects an empty array", () => {
    const result = updateSequencesSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it("rejects duplicate types in the same array", () => {
    const result = updateSequencesSchema.safeParse([
      { type: "INVOICE", prefix: "A-", nextNumber: 1 },
      { type: "INVOICE", prefix: "B-", nextNumber: 1 },
    ]);
    expect(result.success).toBe(false);
  });
});
