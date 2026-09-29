import type { PaymentMethod } from "@billa/shared";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  MOBILE_MONEY: "Mobile Money",
  CHEQUE: "Cheque",
  OTHER: "Other",
};
