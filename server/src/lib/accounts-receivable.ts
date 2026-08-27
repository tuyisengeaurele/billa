import { prisma } from "./prisma.js";

export interface OutstandingInvoice {
  id: string;
  number: string | null;
  customerName: string;
  total: number;
  amountOwed: number;
  dueDate: Date | null;
}

export async function getOutstandingInvoices(businessId: string): Promise<OutstandingInvoice[]> {
  const invoices = await prisma.document.findMany({
    where: {
      businessId,
      type: "INVOICE",
      status: "FINALIZED",
      paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] },
    },
    include: { customer: { select: { name: true } } },
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

  return invoices.map((invoice) => {
    const credited = creditedByInvoice.get(invoice.id) ?? 0;
    return {
      id: invoice.id,
      number: invoice.number,
      customerName: invoice.customer.name,
      total: invoice.total,
      amountOwed: invoice.total - credited - invoice.amountPaid,
      dueDate: invoice.dueDate,
    };
  });
}
