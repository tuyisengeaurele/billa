import { z } from "zod";
import { CURRENCIES, rateProblem } from "./currency.js";
import { MAX_INSTALLMENTS } from "./installments.js";
import {
  DISCOUNT_TYPES,
  DOCUMENT_LANGUAGES,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  RECURRENCE_INTERVALS,
  type DocumentType,
} from "./document-types.js";

export const documentLineSchema = z
  .object({
    itemId: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1, "Enter a description"),
    quantity: z.number({ invalid_type_error: "Enter a quantity" }).positive("Enter a quantity greater than zero"),
    unitPrice: z
      .number({ invalid_type_error: "Enter a price" })
      .int("Enter a valid price")
      .nonnegative("Price can't be negative"),
    taxRate: z
      .number({ invalid_type_error: "Enter a tax rate" })
      .min(0, "Tax rate can't be negative")
      .max(100, "Tax rate can't exceed 100%"),
    discountType: z.enum(DISCOUNT_TYPES).nullable().optional(),
    discountValue: z.number().nonnegative("Discount can't be negative").nullable().optional(),
  })
  .refine((line) => line.discountType !== "PERCENT" || (line.discountValue ?? 0) <= 100, {
    message: "A percentage discount can't exceed 100%",
    path: ["discountValue"],
  });
export type DocumentLineInput = z.infer<typeof documentLineSchema>;

export const installmentSchema = z.object({
  label: z.string().trim().min(1).max(40, "Keep the name under 40 characters").nullable().optional(),
  amount: z
    .number({ invalid_type_error: "Enter an amount" })
    .int("Enter a valid price")
    .positive("Enter an amount greater than zero"),
  dueDate: z.string().trim().min(1, "Choose a due date"),
});
export type InstallmentSchemaInput = z.infer<typeof installmentSchema>;

export const recurrenceSchema = z
  .object({
    interval: z.enum(RECURRENCE_INTERVALS),
    endDate: z.string().trim().min(1).optional(),
  })
  .nullable()
  .optional();
export type RecurrenceInput = z.infer<typeof recurrenceSchema>;

const REFERENCEABLE_TYPES: DocumentType[] = ["DELIVERY_NOTE", "RECEIPT", "CREDIT_NOTE"];
const REQUIRED_REFERENCE_TYPES: DocumentType[] = ["RECEIPT", "CREDIT_NOTE"];

export const documentSchema = z
  .object({
    type: z.enum(DOCUMENT_TYPES),
    customerId: z.string().trim().min(1, "Choose a customer"),
    issueDate: z.string().trim().min(1, "Choose an issue date"),
    dueDate: z.string().trim().min(1).optional(),
    notes: z.string().trim().min(1).optional(),
    customerReference: z.string().trim().min(1).optional(),
    lines: z.array(documentLineSchema),
    recurrence: recurrenceSchema,
    // A payment plan: the invoice is paid in these steps instead of all at once. Left out for full payment.
    installments: z
      .array(installmentSchema)
      .min(2, "Add at least two instalments, or choose to pay in full")
      .max(MAX_INSTALLMENTS, `Use ${MAX_INSTALLMENTS} instalments or fewer`)
      .optional(),
    referencedDocumentId: z.string().trim().min(1).nullable().optional(),
    language: z.enum(DOCUMENT_LANGUAGES).optional().default("EN"),
    // Amounts are whole numbers of the currency's smallest unit. The rate is RWF for one whole unit.
    currency: z.enum(CURRENCIES).optional().default("RWF"),
    exchangeRate: z.number().positive("Enter a rate greater than zero").nullable().optional(),
  })
  .refine((data) => rateProblem(data.currency, data.exchangeRate) === null, {
    message: "Enter the exchange rate for this currency",
    path: ["exchangeRate"],
  })
  .refine((data) => !REQUIRED_REFERENCE_TYPES.includes(data.type) || Boolean(data.referencedDocumentId), {
    message: "Choose the invoice this document is for",
    path: ["referencedDocumentId"],
  })
  .refine((data) => !data.installments || data.type === "INVOICE", {
    message: "Only invoices can be paid in instalments",
    path: ["installments"],
  })
  .refine((data) => !data.installments || !data.recurrence, {
    message: "A repeating invoice cannot use instalments",
    path: ["installments"],
  })
  .refine((data) => REFERENCEABLE_TYPES.includes(data.type) || !data.referencedDocumentId, {
    message: "Only delivery notes, receipts, and credit notes can reference another document",
    path: ["referencedDocumentId"],
  });
export type DocumentInput = z.infer<typeof documentSchema>;

export const updateDocumentRemindersSchema = z.object({ enabled: z.boolean() });
export type UpdateDocumentRemindersInput = z.infer<typeof updateDocumentRemindersSchema>;

export const markDocumentSharedSchema = z.object({ channel: z.enum(["WHATSAPP"]) });
export type MarkDocumentSharedInput = z.infer<typeof markDocumentSharedSchema>;

export const documentListQuerySchema = z.object({
  type: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(",") : undefined))
    .refine(
      (types): types is DocumentType[] | undefined =>
        !types || types.every((t) => (DOCUMENT_TYPES as readonly string[]).includes(t)),
      "Invalid document type",
    ),
  search: z.string().trim().optional(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
  customerId: z.string().trim().min(1).optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  sortBy: z.enum(["issueDate", "total", "createdAt"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;
