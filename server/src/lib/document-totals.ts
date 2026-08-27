export type DiscountType = "PERCENT" | "FLAT";

export interface DocumentLineInput {
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountType?: DiscountType | null;
  discountValue?: number | null;
}

export interface LineTotals {
  lineTotal: number;
  taxAmount: number;
  discountAmount: number;
}

export interface DocumentTotals {
  lines: LineTotals[];
  subtotal: number;
  taxTotal: number;
  total: number;
}

export function calculateDocumentTotals(lines: DocumentLineInput[]): DocumentTotals {
  const computed = lines.map((line) => {
    const rawLineTotal = Math.round(line.quantity * line.unitPrice);
    const rawDiscount =
      line.discountType === "PERCENT"
        ? Math.round(rawLineTotal * ((line.discountValue ?? 0) / 100))
        : line.discountType === "FLAT"
          ? Math.round(line.discountValue ?? 0)
          : 0;
    const discountAmount = Math.min(Math.max(rawDiscount, 0), rawLineTotal);
    const lineTotal = rawLineTotal - discountAmount;
    const taxAmount = Math.round(lineTotal * (line.taxRate / 100));
    return { lineTotal, taxAmount, discountAmount };
  });

  const subtotal = computed.reduce((sum, line) => sum + line.lineTotal, 0);
  const taxTotal = computed.reduce((sum, line) => sum + line.taxAmount, 0);

  return { lines: computed, subtotal, taxTotal, total: subtotal + taxTotal };
}
