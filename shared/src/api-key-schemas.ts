import { z } from "zod";

export const MAX_ACTIVE_API_KEYS = 10;

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1, "Enter a name for this key").max(60, "Keep the name under 60 characters"),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
