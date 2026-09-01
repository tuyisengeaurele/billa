import { z } from "zod";

export const itemSchema = z.object({
  description: z.string().trim().min(1, "Enter a description"),
  unitPrice: z
    .number({ invalid_type_error: "Enter a price" })
    .int("Enter a whole number of RWF")
    .positive("Enter a price greater than zero"),
  unit: z.string().trim().min(1, "Enter a unit"),
  // Remembered so a document line pre-fills the right rate when this item is picked, instead
  // of a business having to re-enter it (or catch a wrong default) on every single invoice.
  taxRate: z
    .number({ invalid_type_error: "Enter a tax rate" })
    .min(0, "Enter a rate between 0 and 100")
    .max(100, "Enter a rate between 0 and 100")
    .optional()
    .default(18),
});
export type ItemInput = z.infer<typeof itemSchema>;

export const itemUpdateSchema = itemSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((data) => Object.keys(data).length > 0, { message: "at least one field is required" });
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;

export const itemListQuerySchema = z.object({
  search: z.string().trim().optional(),
  sortBy: z.enum(["description", "unitPrice", "createdAt"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((value) => value === "true"),
});
export type ItemListQuery = z.infer<typeof itemListQuerySchema>;
