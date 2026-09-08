import { z } from "zod";

export const billingCheckoutSchema = z.object({
  plan: z.enum(["MONTHLY", "ANNUAL"]),
  phoneNumber: z.string().trim().min(9, "Enter a valid phone number").max(15, "Enter a valid phone number"),
});
export type BillingCheckoutInput = z.infer<typeof billingCheckoutSchema>;

export const PLAN_PRICES: Record<"MONTHLY" | "ANNUAL", number> = {
  MONTHLY: 6500,
  ANNUAL: 65000,
};
