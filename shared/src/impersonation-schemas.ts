import { z } from "zod";

export const createImpersonationRequestSchema = z.object({
  targetUserId: z.string().trim().min(1, "Choose who to impersonate"),
  reason: z.string().trim().min(1).optional(),
});
export type CreateImpersonationRequestInput = z.infer<typeof createImpersonationRequestSchema>;

export const overrideImpersonationRequestSchema = z.object({
  overrideReason: z.string().trim().min(1, "Enter a reason"),
});
export type OverrideImpersonationRequestInput = z.infer<typeof overrideImpersonationRequestSchema>;
