import { describe, expect, it } from "vitest";
import { customerListQuerySchema, customerSchema, customerUpdateSchema } from "./customer-schemas.js";

describe("customerSchema", () => {
  it("accepts a name-only customer", () => {
    expect(customerSchema.safeParse({ name: "Kigali Traders" }).success).toBe(true);
  });

  it("rejects a missing name", () => {
    expect(customerSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(customerSchema.safeParse({ name: "Kigali Traders", email: "not-an-email" }).success).toBe(false);
  });
});

describe("customerUpdateSchema", () => {
  it("accepts isActive alone", () => {
    expect(customerUpdateSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(customerUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a partial update without a name", () => {
    expect(customerUpdateSchema.safeParse({ phone: "+250788000000" }).success).toBe(true);
  });
});

describe("customerListQuerySchema", () => {
  it("applies defaults when nothing is provided", () => {
    expect(customerListQuerySchema.parse({})).toEqual({
      sortBy: "createdAt",
      sortOrder: "desc",
      page: 1,
      pageSize: 20,
      includeInactive: false,
    });
  });

  it("coerces page and pageSize from strings", () => {
    const result = customerListQuerySchema.parse({ page: "2", pageSize: "10" });
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
  });

  it("parses includeInactive=false as false, not true", () => {
    expect(customerListQuerySchema.parse({ includeInactive: "false" }).includeInactive).toBe(false);
  });

  it("rejects an unknown sortBy value", () => {
    expect(customerListQuerySchema.safeParse({ sortBy: "banana" }).success).toBe(false);
  });
});
