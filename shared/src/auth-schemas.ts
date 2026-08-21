import { z } from "zod";

const LOWERCASE_RE = /[a-z]/;
const UPPERCASE_RE = /[A-Z]/;
const NUMBER_RE = /[0-9]/;
const SPECIAL_RE = /[^A-Za-z0-9]/;

export const PASSWORD_REQUIREMENTS = [
  { label: "At least 8 characters", test: (value: string) => value.length >= 8 },
  { label: "One lowercase letter", test: (value: string) => LOWERCASE_RE.test(value) },
  { label: "One uppercase letter", test: (value: string) => UPPERCASE_RE.test(value) },
  { label: "One number", test: (value: string) => NUMBER_RE.test(value) },
  { label: "One special character", test: (value: string) => SPECIAL_RE.test(value) },
] as const;

export const sessionSchema = z.object({
  idToken: z.string().trim().min(1, "Missing ID token"),
  businessName: z.string().trim().min(1).optional(),
});
export type SessionInput = z.infer<typeof sessionSchema>;
