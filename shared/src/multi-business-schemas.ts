import { z } from "zod";

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
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
