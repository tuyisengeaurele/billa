import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  phone: z.string().trim().min(1).nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
