import { describe, expect, it } from "vitest";
import { documentLineSchema, documentListQuerySchema, documentSchema } from "./document-schemas.js";

describe("documentLineSchema", () => {
  it("accepts a valid line", () => {
    expect(
      documentLineSchema.safeParse({ description: "Printing", quantity: 2, unitPrice: 5000, taxRate: 18 }).success,
    ).toBe(true);
  });

  it("rejects a zero quantity", () => {
    expect(
      documentLineSchema.safeParse({ description: "Printing", quantity: 0, unitPrice: 5000, taxRate: 18 }).success,
    ).toBe(false);
  });

  it("rejects a tax rate over 100", () => {
    expect(
      documentLineSchema.safeParse({ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 150 }).success,
    ).toBe(false);
  });

  it("rejects a negative unit price", () => {
    expect(
      documentLineSchema.safeParse({ description: "Printing", quantity: 1, unitPrice: -1, taxRate: 18 }).success,
    ).toBe(false);
  });
});

describe("documentSchema", () => {
  it("accepts a document with no lines", () => {
    expect(
      documentSchema.safeParse({ type: "INVOICE", customerId: "c1", issueDate: "2026-08-19", lines: [] }).success,
    ).toBe(true);
  });

  it("rejects a missing customerId", () => {
    expect(documentSchema.safeParse({ type: "INVOICE", issueDate: "2026-08-19", lines: [] }).success).toBe(false);
  });

  it("rejects an unknown type", () => {
    expect(
      documentSchema.safeParse({ type: "BANANA", customerId: "c1", issueDate: "2026-08-19", lines: [] }).success,
    ).toBe(false);
  });
});

describe("documentListQuerySchema", () => {
  it("requires a type", () => {
    expect(documentListQuerySchema.safeParse({}).success).toBe(false);
  });

  it("applies defaults when only type is provided", () => {
    expect(documentListQuerySchema.parse({ type: "INVOICE" })).toEqual({
      type: "INVOICE",
      sortBy: "createdAt",
      sortOrder: "desc",
      page: 1,
      pageSize: 20,
    });
  });
});
