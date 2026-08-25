import { z } from "zod";

export const adminAuditLogQuerySchema = z.object({
  sortBy: z.enum(["createdAt"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});
export type AdminAuditLogQuery = z.infer<typeof adminAuditLogQuerySchema>;

export const adminUserListQuerySchema = z.object({
  search: z.string().trim().optional(),
  sortBy: z.enum(["createdAt", "email"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

export const adminBusinessListQuerySchema = z.object({
  search: z.string().trim().optional(),
  sortBy: z.enum(["createdAt", "name"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});
export type AdminBusinessListQuery = z.infer<typeof adminBusinessListQuerySchema>;

export const extendTrialSchema = z.object({
  days: z.number().int().positive().max(365),
});
export type ExtendTrialInput = z.infer<typeof extendTrialSchema>;

export const postAnnouncementSchema = z.object({
  message: z.string().trim().min(1, "Enter a message").max(500, "Keep it under 500 characters"),
});
export type PostAnnouncementInput = z.infer<typeof postAnnouncementSchema>;

export const renameBusinessSchema = z.object({
  name: z.string().trim().min(1, "Enter a business name").max(200, "Keep it under 200 characters"),
});
export type RenameBusinessInput = z.infer<typeof renameBusinessSchema>;
