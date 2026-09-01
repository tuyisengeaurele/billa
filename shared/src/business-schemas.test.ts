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

  it("accepts null on a nullable field to clear it", () => {
    const result = businessProfileSchema.safeParse({ tin: null });
    expect(result.success).toBe(true);
  });

  it("still rejects an empty string, only null clears a field", () => {
    const result = businessProfileSchema.safeParse({ tin: "" });
    expect(result.success).toBe(false);
  });

  it("rejects null for name, which is required and can't be cleared", () => {
    const result = businessProfileSchema.safeParse({ name: null });
    expect(result.success).toBe(false);
  });

  it("accepts a valid hex primaryColor", () => {
    const result = businessProfileSchema.safeParse({ primaryColor: "#C2185B" });
    expect(result.success).toBe(true);
  });

  it("accepts null primaryColor to reset to the default", () => {
    const result = businessProfileSchema.safeParse({ primaryColor: null });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid primaryColor", () => {
    const result = businessProfileSchema.safeParse({ primaryColor: "not-a-color" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid signatureUrl", () => {
    const result = businessProfileSchema.safeParse({ signatureUrl: "/uploads/b1/signature.png" });
    expect(result.success).toBe(true);
  });

  it("accepts null signatureUrl to clear it", () => {
    const result = businessProfileSchema.safeParse({ signatureUrl: null });
    expect(result.success).toBe(true);
  });

  it("accepts a valid reminderCadenceDays", () => {
    const result = businessProfileSchema.safeParse({ reminderCadenceDays: 3 });
    expect(result.success).toBe(true);
  });

  it("rejects a reminderCadenceDays of zero or below", () => {
    const result = businessProfileSchema.safeParse({ reminderCadenceDays: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects a reminderCadenceDays over 90", () => {
    const result = businessProfileSchema.safeParse({ reminderCadenceDays: 91 });
    expect(result.success).toBe(false);
  });

  it("accepts toggling remindersEnabled", () => {
    const result = businessProfileSchema.safeParse({ remindersEnabled: false });
    expect(result.success).toBe(true);
  });

  it("accepts a valid defaultTemplate", () => {
    const result = businessProfileSchema.safeParse({ defaultTemplate: "PREMIUM" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid defaultTemplate", () => {
    const result = businessProfileSchema.safeParse({ defaultTemplate: "NEON" });
    expect(result.success).toBe(false);
  });

  it("accepts CLASSIC as a defaultTemplate", () => {
    const result = businessProfileSchema.safeParse({ defaultTemplate: "CLASSIC" });
    expect(result.success).toBe(true);
  });

  it("accepts bank and signatory details", () => {
    const result = businessProfileSchema.safeParse({
      bankName: "Bank of Kigali",
      bankAccountNumber: "000123456789",
      signatoryName: "Jane Doe",
      signatoryTitle: "Managing Director",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null on bank and signatory fields to clear them", () => {
    const result = businessProfileSchema.safeParse({ bankName: null, signatoryName: null });
    expect(result.success).toBe(true);
  });

  it("rejects an empty string for bank name, only null clears it", () => {
    const result = businessProfileSchema.safeParse({ bankName: "" });
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
  it("accepts a partial list of valid entries", () => {
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
