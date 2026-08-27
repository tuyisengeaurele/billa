import type { InvoicePaymentStatus } from "@billa/shared";

export const PAYMENT_STATUS_LABELS: Record<InvoicePaymentStatus, string> = {
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  WRITTEN_OFF: "Written off",
};

export const PAYMENT_STATUS_COLORS: Record<InvoicePaymentStatus, string> = {
  UNPAID: "bg-neutral-100 text-neutral-600",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700",
  PAID: "bg-emerald-100 text-emerald-700",
  WRITTEN_OFF: "bg-red-100 text-red-700",
};
