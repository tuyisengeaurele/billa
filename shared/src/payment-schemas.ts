import { z } from "zod";
import { PAYMENT_METHODS } from "./document-types.js";

export const createPaymentSchema = z.object({
  amount: z.number({ invalid_type_error: "Enter an amount" }).int().positive("Enter an amount greater than zero"),
  method: z.enum(PAYMENT_METHODS),
  paidOn: z.string().trim().min(1, "Choose a date"),
  notes: z.string().trim().min(1).optional(),
  generateReceipt: z.boolean().optional().default(false),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const voidPaymentSchema = z.object({
  voidReason: z.string().trim().min(1, "Enter a reason"),
});
export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;

export const writeOffInvoiceSchema = z.object({
  writeOffReason: z.string().trim().min(1, "Enter a reason"),
});
export type WriteOffInvoiceInput = z.infer<typeof writeOffInvoiceSchema>;
