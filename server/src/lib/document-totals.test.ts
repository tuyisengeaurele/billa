import { describe, expect, it } from "vitest";
import { calculateDocumentTotals } from "./document-totals.js";

describe("calculateDocumentTotals", () => {
  it("computes line totals, subtotal, tax, and total", () => {
    const result = calculateDocumentTotals([
      { quantity: 2, unitPrice: 5000, taxRate: 18 },
      { quantity: 1, unitPrice: 1000, taxRate: 0 },
    ]);

    expect(result.lines[0]).toEqual({ lineTotal: 10000, taxAmount: 1800 });
    expect(result.lines[1]).toEqual({ lineTotal: 1000, taxAmount: 0 });
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
});
