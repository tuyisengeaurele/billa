import { z } from "zod";

export const MOMO_ENVIRONMENTS = ["sandbox", "production"] as const;
export type MomoEnvironment = (typeof MOMO_ENVIRONMENTS)[number];

export const updateMomoSettingsSchema = z
  .object({
    enabled: z.boolean(),
    environment: z.enum(MOMO_ENVIRONMENTS),
    targetEnvironment: z.string().trim().min(1).optional(),
    subscriptionKey: z.string().trim().min(1).optional(),
    apiUser: z.string().trim().min(1).optional(),
    apiKey: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.environment !== "production" || Boolean(data.targetEnvironment), {
    message: "targetEnvironment is required for production",
    path: ["targetEnvironment"],
  });
export type UpdateMomoSettingsInput = z.infer<typeof updateMomoSettingsSchema>;

export const testMomoSettingsSchema = z.object({
  environment: z.enum(MOMO_ENVIRONMENTS).optional(),
  targetEnvironment: z.string().trim().min(1).optional(),
  subscriptionKey: z.string().trim().min(1).optional(),
  apiUser: z.string().trim().min(1).optional(),
  apiKey: z.string().trim().min(1).optional(),
});
export type TestMomoSettingsInput = z.infer<typeof testMomoSettingsSchema>;

export const createMomoPaymentRequestSchema = z.object({
  phoneNumber: z.string().trim().min(9, "Enter a valid phone number").max(15, "Enter a valid phone number"),
});
export type CreateMomoPaymentRequestInput = z.infer<typeof createMomoPaymentRequestSchema>;
