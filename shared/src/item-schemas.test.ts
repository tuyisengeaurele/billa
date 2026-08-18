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
