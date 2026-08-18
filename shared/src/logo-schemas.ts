import { z } from "zod";

export const logoUrlSchema = z.object({
  url: z.string().min(1),
});
export type LogoUrlInput = z.infer<typeof logoUrlSchema>;
