import { describe, expect, it } from "vitest";
import { createPaymentSchema, voidPaymentSchema, writeOffInvoiceSchema } from "./payment-schemas.js";

describe("createPaymentSchema", () => {
  it("accepts a valid payment", () => {
    expect(
      createPaymentSchema.safeParse({ amount: 50000, method: "CASH", paidOn: "2026-08-27" }).success,
    ).toBe(true);
  });

  it("rejects a zero amount", () => {
    expect(
      createPaymentSchema.safeParse({ amount: 0, method: "CASH", paidOn: "2026-08-27" }).success,
    ).toBe(false);
  });

  it("rejects an unknown method", () => {
    expect(
      createPaymentSchema.safeParse({ amount: 5000, method: "BITCOIN", paidOn: "2026-08-27" }).success,
    ).toBe(false);
  });

  it("defaults generateReceipt to false", () => {
    const result = createPaymentSchema.parse({ amount: 5000, method: "CASH", paidOn: "2026-08-27" });
    expect(result.generateReceipt).toBe(false);
  });

  it("accepts and passes through an optional reference number, payer name, and receipt image url", () => {
    const result = createPaymentSchema.parse({
      amount: 5000,
      method: "MOBILE_MONEY",
      paidOn: "2026-08-27",
      referenceNumber: "MP240827.1234.A56789",
      payerName: "Jean Mugisha",
      receiptImageUrl: "/uploads/b1/receipt.png",
    });
    expect(result.referenceNumber).toBe("MP240827.1234.A56789");
    expect(result.payerName).toBe("Jean Mugisha");
    expect(result.receiptImageUrl).toBe("/uploads/b1/receipt.png");
  });

  it("is still valid without a reference number, payer name, or receipt image", () => {
    const result = createPaymentSchema.safeParse({ amount: 5000, method: "CASH", paidOn: "2026-08-27" });
    expect(result.success).toBe(true);
  });
});

describe("voidPaymentSchema", () => {
  it("requires a reason", () => {
    expect(voidPaymentSchema.safeParse({ voidReason: "" }).success).toBe(false);
    expect(voidPaymentSchema.safeParse({ voidReason: "Entered by mistake" }).success).toBe(true);
  });
});

describe("writeOffInvoiceSchema", () => {
  it("requires a reason", () => {
    expect(writeOffInvoiceSchema.safeParse({ writeOffReason: "" }).success).toBe(false);
    expect(writeOffInvoiceSchema.safeParse({ writeOffReason: "Customer unreachable" }).success).toBe(true);
  });
});
