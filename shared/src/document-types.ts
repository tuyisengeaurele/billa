// Mirrors the Prisma enums in server/prisma/schema.prisma.
// Kept here (not imported from @prisma/client) so the client workspace
// doesn't need Prisma as a dependency.

export const DOCUMENT_TYPES = [
  "INVOICE",
  "PROFORMA",
  "DELIVERY_NOTE",
  "QUOTE",
  "RECEIPT",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = ["DRAFT", "FINALIZED"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_TEMPLATES = ["MINIMAL", "PREMIUM"] as const;
export type DocumentTemplate = (typeof DOCUMENT_TEMPLATES)[number];

export const RECURRENCE_INTERVALS = ["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY"] as const;
export type RecurrenceInterval = (typeof RECURRENCE_INTERVALS)[number];
