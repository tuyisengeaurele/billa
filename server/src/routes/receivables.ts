import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireActiveSubscription } from "../middleware/require-active-subscription.js";

export const receivablesRouter = Router();

receivablesRouter.use(requireAuth);
receivablesRouter.use(requireActiveSubscription);

const DAY_MS = 24 * 60 * 60 * 1000;

function agingBucket(dueDate: Date | null, now: Date): string {
  if (!dueDate || dueDate >= now) return "current";
  const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / DAY_MS);
  if (daysOverdue <= 30) return "0-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

receivablesRouter.get("/", async (req, res) => {
  const businessId = req.auth!.businessId;
  const now = new Date();

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

  const results = invoices.map((invoice) => {
    const credited = creditedByInvoice.get(invoice.id) ?? 0;
    const amountOwed = invoice.total - credited - invoice.amountPaid;
    const daysOverdue =
      invoice.dueDate && invoice.dueDate < now ? Math.floor((now.getTime() - invoice.dueDate.getTime()) / DAY_MS) : 0;

    return {
      id: invoice.id,
      number: invoice.number,
      customerName: invoice.customer.name,
      total: invoice.total,
      amountOwed,
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null,
      daysOverdue,
      agingBucket: agingBucket(invoice.dueDate, now),
      paymentStatus: invoice.paymentStatus,
    };
  });

  res.json({ results, total: results.length });
});
