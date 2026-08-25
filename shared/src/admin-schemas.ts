import { z } from "zod";

export const adminAuditLogQuerySchema = z.object({
  sortBy: z.enum(["createdAt"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});
export type AdminAuditLogQuery = z.infer<typeof adminAuditLogQuerySchema>;
