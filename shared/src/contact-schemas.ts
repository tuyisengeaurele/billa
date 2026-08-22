import { z } from "zod";

export const contactMessageSchema = z.object({
  name: z.string().trim().min(1, "Enter your name"),
  email: z.string().trim().email("Enter a valid email address"),
  message: z.string().trim().min(10, "Tell us a bit more, at least 10 characters"),
});
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;

export const contactListQuerySchema = z.object({
  search: z.string().trim().optional(),
  sortBy: z.enum(["createdAt"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;
