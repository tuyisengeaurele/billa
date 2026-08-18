import type { DocumentType } from "@billa/shared";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, { singular: string; plural: string }> = {
  INVOICE: { singular: "invoice", plural: "Invoices" },
  PROFORMA: { singular: "proforma invoice", plural: "Proforma invoices" },
  DELIVERY_NOTE: { singular: "delivery note", plural: "Delivery notes" },
  QUOTE: { singular: "quote", plural: "Quotes" },
  RECEIPT: { singular: "receipt", plural: "Receipts" },
};
