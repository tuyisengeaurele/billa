import { buildSchedule, nextInstallmentDue } from "@billa/shared";
import { prisma } from "./prisma.js";
import { toPlan } from "./document-schedule.js";

export interface OutstandingInvoice {
  id: string;
  number: string | null;
  customerName: string;
  customerPhone: string | null;
  publicToken: string;
  total: number;
  amountOwed: number;
  // When the next payment is due: the invoice's due date, or its first unpaid instalment.
  dueDate: Date | null;
  // How much is due by that date: everything still owed, or what is left of that instalment.
  amountDue: number;
  nextInstallmentLabel: string | null;
}

export async function getOutstandingInvoices(businessId: string, customerId?: string): Promise<OutstandingInvoice[]> {
  const invoices = await prisma.document.findMany({
    where: {
      businessId,
      ...(customerId ? { customerId } : {}),
      type: "INVOICE",
      status: "FINALIZED",
      paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] },
    },
    include: { customer: { select: { name: true, phone: true } }, installments: { orderBy: { sortOrder: "asc" } } },
    orderBy: { dueDate: "asc" },
  });

  const creditNotes = await prisma.document.findMany({
    where: {
      businessId,
      type: "CREDIT_NOTE",
      status: "FINALIZED",
      referencedDocumentId: { in: invoices.map((invoice) => invoice.id) },
    },
  });
  const creditedByInvoice = new Map<string, number>();
  for (const creditNote of creditNotes) {
    if (!creditNote.referencedDocumentId) continue;
    creditedByInvoice.set(
      creditNote.referencedDocumentId,
      (creditedByInvoice.get(creditNote.referencedDocumentId) ?? 0) + creditNote.total,
    );
  }

  const now = new Date();
  return invoices.map((invoice) => {
    const credited = creditedByInvoice.get(invoice.id) ?? 0;
    const amountOwed = invoice.total - credited - invoice.amountPaid;
    // Payments and credit notes both count towards the earliest instalments first.
    const next =
      invoice.installments.length > 0
        ? nextInstallmentDue(buildSchedule(toPlan(invoice.installments), invoice.total - amountOwed, now))
        : null;
    return {
      id: invoice.id,
      number: invoice.number,
      customerName: invoice.customer.name,
      customerPhone: invoice.customer.phone,
      publicToken: invoice.publicToken,
      total: invoice.total,
      amountOwed,
      dueDate: next ? new Date(next.dueDate) : invoice.dueDate,
      amountDue: next ? next.remaining : amountOwed,
      nextInstallmentLabel: next ? next.label : null,
    };
  });
}
