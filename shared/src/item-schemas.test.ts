import { describe, expect, it } from "vitest";
import { itemListQuerySchema, itemSchema, itemUpdateSchema } from "./item-schemas.js";

describe("itemSchema", () => {
  it("accepts a valid item", () => {
    expect(itemSchema.safeParse({ description: "Printing", unitPrice: 5000, unit: "service" }).success).toBe(true);
  });

  it("rejects a missing description", () => {
    expect(itemSchema.safeParse({ unitPrice: 5000, unit: "service" }).success).toBe(false);
  });

  it("rejects a zero or negative price", () => {
    expect(itemSchema.safeParse({ description: "Printing", unitPrice: 0, unit: "service" }).success).toBe(false);
  });

  it("rejects a non-integer price", () => {
    expect(itemSchema.safeParse({ description: "Printing", unitPrice: 5000.5, unit: "service" }).success).toBe(
      false,
    );
  });

  it("rejects a missing unit", () => {
    expect(itemSchema.safeParse({ description: "Printing", unitPrice: 5000 }).success).toBe(false);
  });

  it("defaults the tax rate to 18 when it isn't provided", () => {
    const result = itemSchema.safeParse({ description: "Printing", unitPrice: 5000, unit: "service" });
    expect(result.success && result.data.taxRate).toBe(18);
  });

  it("accepts an explicit tax rate, including 0 for VAT-exempt items", () => {
    const result = itemSchema.safeParse({ description: "Bread", unitPrice: 500, unit: "piece", taxRate: 0 });
    expect(result.success && result.data.taxRate).toBe(0);
  });

  it("rejects a tax rate below 0 or above 100", () => {
    expect(
      itemSchema.safeParse({ description: "Printing", unitPrice: 5000, unit: "service", taxRate: -1 }).success,
    ).toBe(false);
    expect(
      itemSchema.safeParse({ description: "Printing", unitPrice: 5000, unit: "service", taxRate: 101 }).success,
    ).toBe(false);
  });

  it("accepts an optional category", () => {
    const result = itemSchema.safeParse({
      description: "Printing",
      unitPrice: 5000,
      unit: "service",
      category: "Printing services",
    });
    expect(result.success && result.data.category).toBe("Printing services");
  });

  it("treats a blank category string as no category", () => {
    const result = itemSchema.safeParse({
      description: "Printing",
      unitPrice: 5000,
      unit: "service",
      category: "",
    });
    expect(result.success && result.data.category).toBeNull();
  });

  it("allows category to be omitted or null", () => {
    expect(itemSchema.safeParse({ description: "Printing", unitPrice: 5000, unit: "service" }).success).toBe(true);
    expect(
      itemSchema.safeParse({ description: "Printing", unitPrice: 5000, unit: "service", category: null }).success,
    ).toBe(true);
  });
});

describe("itemUpdateSchema", () => {
  it("accepts isActive alone", () => {
    expect(itemUpdateSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(itemUpdateSchema.safeParse({}).success).toBe(false);
  });
});

describe("itemListQuerySchema", () => {
  it("applies defaults when nothing is provided", () => {
    expect(itemListQuerySchema.parse({})).toEqual({
      sortBy: "createdAt",
      sortOrder: "desc",
      page: 1,
      pageSize: 20,
      includeInactive: false,
    });
  });

  it("rejects an unknown sortBy value", () => {
    expect(itemListQuerySchema.safeParse({ sortBy: "banana" }).success).toBe(false);
  });
});
