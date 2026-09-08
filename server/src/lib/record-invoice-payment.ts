import type { InvoicePayment, PaymentMethod } from "@prisma/client";
import { prisma } from "./prisma.js";
import { recomputeInvoicePaymentStatus } from "./invoice-payment-status.js";
import { createNotification } from "./notifications.js";

export interface RecordInvoicePaymentInput {
  businessId: string;
  documentId: string;
  amount: number;
  method: PaymentMethod;
  paidOn: Date;
  createdByUserId: string;
  notes?: string | null;
  referenceNumber?: string | null;
  payerName?: string | null;
  receiptImageUrl?: string | null;
  momoPaymentRequestId?: string | null;
}

export async function recordInvoicePayment(input: RecordInvoicePaymentInput): Promise<InvoicePayment> {
  const payment = await prisma.invoicePayment.create({
    data: {
      businessId: input.businessId,
      documentId: input.documentId,
      amount: input.amount,
      method: input.method,
      paidOn: input.paidOn,
      notes: input.notes,
      referenceNumber: input.referenceNumber,
      payerName: input.payerName,
      receiptImageUrl: input.receiptImageUrl,
      createdByUserId: input.createdByUserId,
      momoPaymentRequestId: input.momoPaymentRequestId,
    },
  });

  await recomputeInvoicePaymentStatus(input.documentId);

  const [invoice, business] = await Promise.all([
    prisma.document.findUnique({ where: { id: input.documentId }, select: { number: true } }),
    prisma.business.findUnique({ where: { id: input.businessId }, select: { ownerId: true } }),
  ]);
  if (business) {
    await createNotification({
      userId: business.ownerId,
      type: "PAYMENT_RECEIVED",
      title: `Payment received for ${invoice?.number ?? "an invoice"}`,
      link: `/documents/${input.documentId}`,
    });
  }

  return payment;
}
