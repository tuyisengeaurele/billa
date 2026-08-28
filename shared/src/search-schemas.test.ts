import { describe, expect, it } from "vitest";
import { searchQuerySchema } from "./search-schemas.js";

describe("searchQuerySchema", () => {
  it("accepts a query of 2 or more characters", () => {
    expect(searchQuerySchema.safeParse({ q: "ac" }).success).toBe(true);
  });

  it("rejects a query shorter than 2 characters", () => {
    expect(searchQuerySchema.safeParse({ q: "a" }).success).toBe(false);
  });

  it("rejects a missing q", () => {
    expect(searchQuerySchema.safeParse({}).success).toBe(false);
  });

  it("trims whitespace before checking length", () => {
    expect(searchQuerySchema.safeParse({ q: " a " }).success).toBe(false);
    expect(searchQuerySchema.parse({ q: " ac " }).q).toBe("ac");
  });
});
