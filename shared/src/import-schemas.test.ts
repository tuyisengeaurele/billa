import { describe, expect, it } from "vitest";
import {
  CUSTOMER_IMPORT_FIELDS,
  guessColumnMapping,
  importRowsRequestSchema,
  ITEM_IMPORT_FIELDS,
  parseCustomerImportRow,
  parseItemImportRow,
} from "./import-schemas.js";

describe("guessColumnMapping", () => {
  it("matches headers regardless of case, spaces and punctuation", () => {
    const mapping = guessColumnMapping(["Customer Name", "Phone Number", "E-mail", "TIN"], CUSTOMER_IMPORT_FIELDS);
    expect(mapping).toEqual({ name: 0, phone: 1, email: 2, tin: 3, address: null });
  });

  it("leaves a field unmapped when nothing looks like it", () => {
    const mapping = guessColumnMapping(["Whatever", "Other"], CUSTOMER_IMPORT_FIELDS);
    expect(mapping.name).toBeNull();
  });

  it("uses each column for only one field", () => {
    const mapping = guessColumnMapping(["Name", "Price"], ITEM_IMPORT_FIELDS);
    expect(mapping.description).toBe(0);
    expect(mapping.unitPrice).toBe(1);
  });
});

describe("parseCustomerImportRow", () => {
  it("accepts a row with only a name", () => {
    expect(parseCustomerImportRow({ name: "Acme Ltd" })).toEqual({ ok: true, value: { name: "Acme Ltd" } });
  });

  it("drops blank optional fields", () => {
    expect(parseCustomerImportRow({ name: "Acme", phone: "", email: "  " })).toEqual({
      ok: true,
      value: { name: "Acme" },
    });
  });

  it("rejects a missing name", () => {
    expect(parseCustomerImportRow({ name: "", phone: "0788123456" })).toEqual({
      ok: false,
      error: "Enter a customer name",
    });
  });

  it("rejects a bad email", () => {
    const result = parseCustomerImportRow({ name: "Acme", email: "not-an-email" });
    expect(result.ok).toBe(false);
  });
});

describe("parseItemImportRow", () => {
  it("reads a price written with commas and a currency label", () => {
    expect(parseItemImportRow({ description: "Cement", unitPrice: "12,500 RWF", unit: "bag", taxRate: "18%" })).toEqual({
      ok: true,
      value: { description: "Cement", unitPrice: 12500, unit: "bag", taxRate: 18, category: null },
    });
  });

  it("defaults the unit and tax rate when they are blank", () => {
    const result = parseItemImportRow({ description: "Consulting", unitPrice: "50000" });
    expect(result).toEqual({
      ok: true,
      value: { description: "Consulting", unitPrice: 50000, unit: "each", taxRate: 18, category: null },
    });
  });

  it("rounds a price with decimals to whole francs", () => {
    const result = parseItemImportRow({ description: "Pen", unitPrice: "150.50" });
    expect(result.ok && result.value.unitPrice).toBe(151);
  });

  it("rejects a row with no usable price", () => {
    expect(parseItemImportRow({ description: "Pen", unitPrice: "free" }).ok).toBe(false);
    expect(parseItemImportRow({ description: "Pen", unitPrice: "0" }).ok).toBe(false);
  });

  it("rejects a missing description", () => {
    expect(parseItemImportRow({ description: "", unitPrice: "100" }).ok).toBe(false);
  });

  it("rejects a tax rate over 100", () => {
    expect(parseItemImportRow({ description: "Pen", unitPrice: "100", taxRate: "150" }).ok).toBe(false);
  });
});

describe("importRowsRequestSchema", () => {
  it("accepts up to 500 rows", () => {
    const rows = Array.from({ length: 500 }, () => ({ name: "A" }));
    expect(importRowsRequestSchema.safeParse({ rows }).success).toBe(true);
  });

  it("rejects an empty list and more than 500 rows", () => {
    expect(importRowsRequestSchema.safeParse({ rows: [] }).success).toBe(false);
    const rows = Array.from({ length: 501 }, () => ({ name: "A" }));
    expect(importRowsRequestSchema.safeParse({ rows }).success).toBe(false);
  });
});
