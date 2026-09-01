import { z } from "zod";
import { BUSINESS_MEMBER_ROLES } from "./document-types.js";

export const BUSINESS_LIMIT = 3;

export const switchBusinessSchema = z.object({
  businessId: z.string().trim().min(1),
});
export type SwitchBusinessInput = z.infer<typeof switchBusinessSchema>;

export const createBusinessSchema = z.object({
  name: z.string().trim().min(1),
});
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const createInviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(BUSINESS_MEMBER_ROLES).optional().default("MEMBER"),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(BUSINESS_MEMBER_ROLES),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
