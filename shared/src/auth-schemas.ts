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

export const registerSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(LOWERCASE_RE, "Password must include a lowercase letter")
    .regex(UPPERCASE_RE, "Password must include an uppercase letter")
    .regex(NUMBER_RE, "Password must include a number")
    .regex(SPECIAL_RE, "Password must include a special character"),
  businessName: z.string().min(1, "Enter your business name"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
export type LoginInput = z.infer<typeof loginSchema>;
