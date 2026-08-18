import { z } from "zod";

const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;

export const logoUrlSchema = z.object({
  url: z.string().min(1),
});
export type LogoUrlInput = z.infer<typeof logoUrlSchema>;

export const confirmLogoSchema = z.object({
  url: z.string().min(1),
  primaryColor: z.string().regex(hexColorPattern),
  accentColors: z.array(z.string().regex(hexColorPattern)).max(6),
});
export type ConfirmLogoInput = z.infer<typeof confirmLogoSchema>;
