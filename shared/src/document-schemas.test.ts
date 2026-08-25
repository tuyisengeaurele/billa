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

  it("accepts a valid recurrence", () => {
    const result = documentSchema.safeParse({
      type: "INVOICE",
      customerId: "c1",
      issueDate: "2026-08-19",
      lines: [],
      recurrence: { interval: "MONTHLY", endDate: "2027-08-19" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts null recurrence to mean not recurring", () => {
    expect(
      documentSchema.safeParse({
        type: "INVOICE",
        customerId: "c1",
        issueDate: "2026-08-19",
        lines: [],
        recurrence: null,
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown recurrence interval", () => {
    expect(
      documentSchema.safeParse({
        type: "INVOICE",
        customerId: "c1",
        issueDate: "2026-08-19",
        lines: [],
        recurrence: { interval: "DAILY" },
      }).success,
    ).toBe(false);
  });

  it("requires a referencedDocumentId for a receipt", () => {
    const result = documentSchema.safeParse({
      type: "RECEIPT",
      customerId: "c1",
      issueDate: "2026-08-19",
      lines: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a receipt with a referencedDocumentId", () => {
    const result = documentSchema.safeParse({
      type: "RECEIPT",
      customerId: "c1",
      issueDate: "2026-08-19",
      lines: [],
      referencedDocumentId: "inv1",
    });
    expect(result.success).toBe(true);
  });

  it("allows a delivery note with no referencedDocumentId", () => {
    const result = documentSchema.safeParse({
      type: "DELIVERY_NOTE",
      customerId: "c1",
      issueDate: "2026-08-19",
      lines: [],
    });
    expect(result.success).toBe(true);
  });

  it("allows a delivery note with a referencedDocumentId", () => {
    const result = documentSchema.safeParse({
      type: "DELIVERY_NOTE",
      customerId: "c1",
      issueDate: "2026-08-19",
      lines: [],
      referencedDocumentId: "inv1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a referencedDocumentId on a document type that can't reference one", () => {
    const result = documentSchema.safeParse({
      type: "INVOICE",
      customerId: "c1",
      issueDate: "2026-08-19",
      lines: [],
      referencedDocumentId: "inv1",
    });
    expect(result.success).toBe(false);
  });
});

describe("documentListQuerySchema", () => {
  it("has no type filter when type is omitted", () => {
    expect(documentListQuerySchema.parse({}).type).toBeUndefined();
  });

  it("parses a single type into a one-item array", () => {
    expect(documentListQuerySchema.parse({ type: "INVOICE" })).toEqual({
      type: ["INVOICE"],
      sortBy: "createdAt",
      sortOrder: "desc",
      page: 1,
      pageSize: 20,
    });
  });

  it("parses a comma-separated type list into an array", () => {
    expect(documentListQuerySchema.parse({ type: "INVOICE,PROFORMA" }).type).toEqual(["INVOICE", "PROFORMA"]);
  });

  it("rejects an unknown type", () => {
    expect(documentListQuerySchema.safeParse({ type: "BANANA" }).success).toBe(false);
  });

  it("accepts dateFrom and dateTo", () => {
    const result = documentListQuerySchema.parse({ dateFrom: "2026-08-01", dateTo: "2026-08-31" });
    expect(result.dateFrom).toBe("2026-08-01");
    expect(result.dateTo).toBe("2026-08-31");
  });

  it("accepts a valid status filter", () => {
    expect(documentListQuerySchema.parse({ status: "FINALIZED" }).status).toBe("FINALIZED");
  });

  it("rejects an invalid status filter", () => {
    expect(documentListQuerySchema.safeParse({ status: "VOID" }).success).toBe(false);
  });
});
