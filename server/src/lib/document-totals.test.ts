import { describe, expect, it } from "vitest";
import { calculateDocumentTotals } from "./document-totals.js";

describe("calculateDocumentTotals", () => {
  it("computes line totals, subtotal, tax, and total", () => {
    const result = calculateDocumentTotals([
      { quantity: 2, unitPrice: 5000, taxRate: 18 },
      { quantity: 1, unitPrice: 1000, taxRate: 0 },
    ]);

    expect(result.lines[0]).toEqual({ lineTotal: 10000, taxAmount: 1800, discountAmount: 0 });
    expect(result.lines[1]).toEqual({ lineTotal: 1000, taxAmount: 0, discountAmount: 0 });
    expect(result.subtotal).toBe(11000);
    expect(result.taxTotal).toBe(1800);
    expect(result.total).toBe(12800);
  });

  it("returns zeros for an empty line list", () => {
    const result = calculateDocumentTotals([]);
    expect(result).toEqual({ lines: [], subtotal: 0, taxTotal: 0, total: 0 });
  });

  it("rounds fractional quantities to the nearest RWF", () => {
    const result = calculateDocumentTotals([{ quantity: 2.5, unitPrice: 1000, taxRate: 10 }]);
    expect(result.lines[0].lineTotal).toBe(2500);
    expect(result.lines[0].taxAmount).toBe(250);
  });

  it("applies a percentage discount before computing tax", () => {
    const result = calculateDocumentTotals([
      { quantity: 1, unitPrice: 10000, taxRate: 18, discountType: "PERCENT", discountValue: 10 },
    ]);

    // 10000 - 10% = 9000 discounted subtotal, tax = 9000 * 18% = 1620
    expect(result.lines[0]).toEqual({ lineTotal: 9000, taxAmount: 1620, discountAmount: 1000 });
    expect(result.subtotal).toBe(9000);
    expect(result.total).toBe(10620);
  });

  it("applies a flat discount before computing tax", () => {
    const result = calculateDocumentTotals([
      { quantity: 1, unitPrice: 10000, taxRate: 18, discountType: "FLAT", discountValue: 2000 },
    ]);

    expect(result.lines[0]).toEqual({ lineTotal: 8000, taxAmount: 1440, discountAmount: 2000 });
  });

  it("clamps a discount so a line can never go negative", () => {
    const result = calculateDocumentTotals([
      { quantity: 1, unitPrice: 5000, taxRate: 18, discountType: "FLAT", discountValue: 9000 },
    ]);

    expect(result.lines[0]).toEqual({ lineTotal: 0, taxAmount: 0, discountAmount: 5000 });
  });

  it("treats a missing discountType as no discount", () => {
    const result = calculateDocumentTotals([{ quantity: 1, unitPrice: 5000, taxRate: 18 }]);
    expect(result.lines[0].discountAmount).toBe(0);
  });
});
