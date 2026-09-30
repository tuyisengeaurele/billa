import type { PaymentMethod } from "@prisma/client";
import { prisma } from "./prisma.js";
import { calculateDocumentTotals } from "./document-totals.js";
import { finalizeDocumentById } from "./finalize-document.js";

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  MOBILE_MONEY: "Mobile Money",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

export interface GeneratePaymentReceiptInput {
  businessId: string;
  invoiceId: string;
  paymentId: string;
  amount: number;
  method: PaymentMethod;
  paidOn: Date;
}

/** Issues a finalized receipt for one payment and links it to that payment. Returns the receipt's id, or null if it couldn't be finalized. */
export async function generatePaymentReceipt(input: GeneratePaymentReceiptInput): Promise<string | null> {
  const [business, invoice] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: input.businessId } }),
    prisma.document.findUniqueOrThrow({ where: { id: input.invoiceId } }),
  ]);
  const totals = calculateDocumentTotals([{ quantity: 1, unitPrice: input.amount, taxRate: 0 }]);

  const draftReceipt = await prisma.document.create({
    data: {
      businessId: input.businessId,
      type: "RECEIPT",
      status: "DRAFT",
      template: business.defaultTemplate,
      customerId: invoice.customerId,
      issueDate: input.paidOn,
      referencedDocumentId: input.invoiceId,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      currency: invoice.currency,
      exchangeRate: invoice.exchangeRate,
      lines: {
        create: [
          {
            description: `Payment received (${PAYMENT_METHOD_LABELS[input.method]})`,
            quantity: 1,
            unitPrice: input.amount,
            taxRate: 0,
            lineTotal: totals.lines[0].lineTotal,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  const finalized = await finalizeDocumentById(input.businessId, draftReceipt.id);
  if (!finalized.ok) return null;

  await prisma.invoicePayment.update({
    where: { id: input.paymentId },
    data: { receiptDocumentId: finalized.document.id },
  });
  return finalized.document.id;
}
