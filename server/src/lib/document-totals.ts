export interface DocumentLineInput {
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export interface LineTotals {
  lineTotal: number;
  taxAmount: number;
}

export interface DocumentTotals {
  lines: LineTotals[];
  subtotal: number;
  taxTotal: number;
  total: number;
}

export function calculateDocumentTotals(lines: DocumentLineInput[]): DocumentTotals {
  const computed = lines.map((line) => {
    const lineTotal = Math.round(line.quantity * line.unitPrice);
    const taxAmount = Math.round(lineTotal * (line.taxRate / 100));
    return { lineTotal, taxAmount };
  });

  const subtotal = computed.reduce((sum, line) => sum + line.lineTotal, 0);
  const taxTotal = computed.reduce((sum, line) => sum + line.taxAmount, 0);

  return { lines: computed, subtotal, taxTotal, total: subtotal + taxTotal };
}
