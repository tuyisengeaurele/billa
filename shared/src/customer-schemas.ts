import { z } from "zod";

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Enter a customer name"),
  tin: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  email: z.string().trim().email("Enter a valid email address").optional(),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const customerUpdateSchema = customerSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((data) => Object.keys(data).length > 0, { message: "at least one field is required" });
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

export const customerListQuerySchema = z.object({
  search: z.string().trim().optional(),
  sortBy: z.enum(["name", "createdAt"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((value) => value === "true"),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
