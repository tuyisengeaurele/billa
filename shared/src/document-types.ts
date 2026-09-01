// Mirrors the Prisma enums in server/prisma/schema.prisma.
// Kept here (not imported from @prisma/client) so the client workspace
// doesn't need Prisma as a dependency.

export const DOCUMENT_TYPES = [
  "INVOICE",
  "PROFORMA",
  "DELIVERY_NOTE",
  "QUOTE",
  "RECEIPT",
  "CREDIT_NOTE",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = ["DRAFT", "FINALIZED"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_TEMPLATES = ["MINIMAL", "PREMIUM", "CLASSIC"] as const;
export type DocumentTemplate = (typeof DOCUMENT_TEMPLATES)[number];

// The language the PDF's own labels render in, independent of the app's UI
// language. Kinyarwanda deferred until its business/financial terminology
// can be verified with a native speaker rather than guessed.
export const DOCUMENT_LANGUAGES = ["EN", "FR"] as const;
export type DocumentLanguage = (typeof DOCUMENT_LANGUAGES)[number];

export const RECURRENCE_INTERVALS = ["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY"] as const;
export type RecurrenceInterval = (typeof RECURRENCE_INTERVALS)[number];

export const DISCOUNT_TYPES = ["PERCENT", "FLAT"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const INVOICE_PAYMENT_STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID", "WRITTEN_OFF"] as const;
export type InvoicePaymentStatus = (typeof INVOICE_PAYMENT_STATUSES)[number];

// ACCOUNTANT is read-only across all business data (see the server's
// blockAccountantMutations middleware); MEMBER keeps full read/write access.
export const BUSINESS_MEMBER_ROLES = ["MEMBER", "ACCOUNTANT"] as const;
export type BusinessMemberRole = (typeof BUSINESS_MEMBER_ROLES)[number];
