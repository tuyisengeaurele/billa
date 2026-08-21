import { describe, expect, it } from "vitest";
import { billingCheckoutSchema, billingVerifySchema, PLAN_PRICES } from "./billing-schemas.js";

describe("billingCheckoutSchema", () => {
  it("accepts MONTHLY", () => {
    expect(billingCheckoutSchema.safeParse({ plan: "MONTHLY" }).success).toBe(true);
  });

  it("accepts ANNUAL", () => {
    expect(billingCheckoutSchema.safeParse({ plan: "ANNUAL" }).success).toBe(true);
  });

  it("rejects an unknown plan", () => {
    expect(billingCheckoutSchema.safeParse({ plan: "WEEKLY" }).success).toBe(false);
  });
});

describe("billingVerifySchema", () => {
  it("accepts a valid payload", () => {
    expect(billingVerifySchema.safeParse({ txRef: "billa-1-abc", transactionId: "12345" }).success).toBe(true);
  });

  it("rejects a missing txRef", () => {
    expect(billingVerifySchema.safeParse({ transactionId: "12345" }).success).toBe(false);
  });
});

describe("PLAN_PRICES", () => {
  it("has the agreed RWF prices", () => {
    expect(PLAN_PRICES.MONTHLY).toBe(6500);
    expect(PLAN_PRICES.ANNUAL).toBe(65000);
  });
});
