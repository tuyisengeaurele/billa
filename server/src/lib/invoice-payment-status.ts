import type { Document } from "@prisma/client";
import { prisma } from "./prisma.js";

export async function recomputeInvoicePaymentStatus(invoiceId: string): Promise<void> {
  const invoice = await prisma.document.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.type !== "INVOICE") return;
  if (invoice.paymentStatus === "WRITTEN_OFF") return;

  const [payments, creditNotes] = await Promise.all([
    prisma.invoicePayment.findMany({ where: { documentId: invoiceId, voidedAt: null } }),
    prisma.document.findMany({
      where: { referencedDocumentId: invoiceId, type: "CREDIT_NOTE", status: "FINALIZED" },
    }),
  ]);

  const amountPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const creditedTotal = creditNotes.reduce((sum, doc) => sum + doc.total, 0);
  const amountOwed = invoice.total - creditedTotal;

  const status = amountOwed <= 0 ? "PAID" : amountPaid === 0 ? "UNPAID" : amountPaid < amountOwed ? "PARTIALLY_PAID" : "PAID";

  await prisma.document.update({
    where: { id: invoiceId },
    data: { amountPaid, paymentStatus: status },
  });
}

export async function getInvoiceOutstandingBalance(
  documentId: string,
): Promise<{ invoice: Document; amountOwed: number } | null> {
  const invoice = await prisma.document.findUnique({ where: { id: documentId } });
  if (!invoice || invoice.type !== "INVOICE" || invoice.status !== "FINALIZED") return null;

  const creditNotes = await prisma.document.findMany({
    where: { referencedDocumentId: documentId, type: "CREDIT_NOTE", status: "FINALIZED" },
  });
  const creditedTotal = creditNotes.reduce((sum, doc) => sum + doc.total, 0);
  const amountOwed = invoice.total - creditedTotal - invoice.amountPaid;

  return { invoice, amountOwed };
}
