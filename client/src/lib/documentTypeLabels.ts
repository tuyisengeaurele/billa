import type { DocumentType } from "@billa/shared";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, { singular: string; plural: string; description: string }> = {
  INVOICE: {
    singular: "invoice",
    plural: "Invoices",
    description: "Bill customers with itemized totals and RWF tax calculations.",
  },
  PROFORMA: {
    singular: "proforma invoice",
    plural: "Proforma invoices",
    description: "Send a formal quote before the sale, then convert it to an invoice in one click.",
  },
  DELIVERY_NOTE: {
    singular: "delivery note",
    plural: "Delivery notes",
    description: "Confirm what was delivered, separate from what's being billed.",
  },
  QUOTE: {
    singular: "quote",
    plural: "Quotes",
    description: "Give a customer a price before they commit.",
  },
  RECEIPT: {
    singular: "receipt",
    plural: "Receipts",
    description: "Confirm that payment was received.",
  },
  CREDIT_NOTE: {
    singular: "credit note",
    plural: "Credit notes",
    description: "Adjust an invoice for a return, discount, or correction.",
  },
};
