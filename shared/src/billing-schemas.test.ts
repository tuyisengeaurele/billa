import { describe, expect, it } from "vitest";
import { billingCheckoutSchema, PLAN_PRICES } from "./billing-schemas.js";

describe("billingCheckoutSchema", () => {
  it("accepts MONTHLY with a phone number", () => {
    expect(billingCheckoutSchema.safeParse({ plan: "MONTHLY", phoneNumber: "250788000000" }).success).toBe(true);
  });

  it("accepts ANNUAL with a phone number", () => {
    expect(billingCheckoutSchema.safeParse({ plan: "ANNUAL", phoneNumber: "250788000000" }).success).toBe(true);
  });

  it("rejects a missing phone number", () => {
    expect(billingCheckoutSchema.safeParse({ plan: "MONTHLY" }).success).toBe(false);
  });

  it("rejects an unknown plan", () => {
    expect(billingCheckoutSchema.safeParse({ plan: "WEEKLY", phoneNumber: "250788000000" }).success).toBe(false);
  });
});

describe("PLAN_PRICES", () => {
  it("has the agreed RWF prices", () => {
    expect(PLAN_PRICES.MONTHLY).toBe(6500);
    expect(PLAN_PRICES.ANNUAL).toBe(65000);
  });
});
