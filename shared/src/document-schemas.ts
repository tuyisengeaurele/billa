import { z } from "zod";
import { DOCUMENT_STATUSES, DOCUMENT_TYPES, RECURRENCE_INTERVALS, type DocumentType } from "./document-types.js";

export const documentLineSchema = z.object({
  itemId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1, "Enter a description"),
  quantity: z.number({ invalid_type_error: "Enter a quantity" }).positive("Enter a quantity greater than zero"),
  unitPrice: z
    .number({ invalid_type_error: "Enter a price" })
    .int("Enter a whole number of RWF")
    .nonnegative("Price can't be negative"),
  taxRate: z
    .number({ invalid_type_error: "Enter a tax rate" })
    .min(0, "Tax rate can't be negative")
    .max(100, "Tax rate can't exceed 100%"),
});
export type DocumentLineInput = z.infer<typeof documentLineSchema>;

export const recurrenceSchema = z
  .object({
    interval: z.enum(RECURRENCE_INTERVALS),
    endDate: z.string().trim().min(1).optional(),
  })
  .nullable()
  .optional();
export type RecurrenceInput = z.infer<typeof recurrenceSchema>;

const REFERENCEABLE_TYPES: DocumentType[] = ["DELIVERY_NOTE", "RECEIPT"];

export const documentSchema = z
  .object({
    type: z.enum(DOCUMENT_TYPES),
    customerId: z.string().trim().min(1, "Choose a customer"),
    issueDate: z.string().trim().min(1, "Choose an issue date"),
    dueDate: z.string().trim().min(1).optional(),
    notes: z.string().trim().min(1).optional(),
    lines: z.array(documentLineSchema),
    recurrence: recurrenceSchema,
    referencedDocumentId: z.string().trim().min(1).nullable().optional(),
  })
  .refine((data) => data.type !== "RECEIPT" || Boolean(data.referencedDocumentId), {
    message: "Choose the invoice this receipt is for",
    path: ["referencedDocumentId"],
  })
  .refine((data) => REFERENCEABLE_TYPES.includes(data.type) || !data.referencedDocumentId, {
    message: "Only delivery notes and receipts can reference another document",
    path: ["referencedDocumentId"],
  });
export type DocumentInput = z.infer<typeof documentSchema>;

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
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  sortBy: z.enum(["issueDate", "total", "createdAt"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;
