import { z } from "zod";

export const billingCheckoutSchema = z.object({
  plan: z.enum(["MONTHLY", "ANNUAL"]),
});
export type BillingCheckoutInput = z.infer<typeof billingCheckoutSchema>;

export const billingVerifySchema = z.object({
  txRef: z.string().trim().min(1),
  transactionId: z.string().trim().min(1),
});
export type BillingVerifyInput = z.infer<typeof billingVerifySchema>;

export const PLAN_PRICES: Record<"MONTHLY" | "ANNUAL", number> = {
  MONTHLY: 6500,
  ANNUAL: 65000,
};
