import { describe, expect, it } from "vitest";
import { mergeSequences } from "./document-sequences.js";

describe("mergeSequences", () => {
  it("returns computed defaults for all 5 types when nothing is saved", () => {
    const result = mergeSequences([]);
    expect(result).toEqual([
      { type: "INVOICE", prefix: "INV-", nextNumber: 1 },
      { type: "PROFORMA", prefix: "PRO-", nextNumber: 1 },
      { type: "DELIVERY_NOTE", prefix: "DN-", nextNumber: 1 },
      { type: "QUOTE", prefix: "QTE-", nextNumber: 1 },
      { type: "RECEIPT", prefix: "RCT-", nextNumber: 1 },
    ]);
  });

  it("uses the saved row for a type that has one, defaults for the rest", () => {
    const result = mergeSequences([{ type: "INVOICE", prefix: "CUSTOM-", nextNumber: 42 }]);
    const invoice = result.find((r) => r.type === "INVOICE");
    const quote = result.find((r) => r.type === "QUOTE");
    expect(invoice).toEqual({ type: "INVOICE", prefix: "CUSTOM-", nextNumber: 42 });
    expect(quote).toEqual({ type: "QUOTE", prefix: "QTE-", nextNumber: 1 });
  });
});
