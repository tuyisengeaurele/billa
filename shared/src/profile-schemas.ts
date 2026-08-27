import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
