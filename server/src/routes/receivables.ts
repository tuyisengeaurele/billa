import { Router } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import { requireActiveSubscription } from "../middleware/require-active-subscription.js";
import { getOutstandingInvoices } from "../lib/accounts-receivable.js";

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

  const invoices = await getOutstandingInvoices(businessId);

  const results = invoices.map((invoice) => {
    const daysOverdue =
      invoice.dueDate && invoice.dueDate < now ? Math.floor((now.getTime() - invoice.dueDate.getTime()) / DAY_MS) : 0;

    return {
      id: invoice.id,
      number: invoice.number,
      customerName: invoice.customerName,
      total: invoice.total,
      amountOwed: invoice.amountOwed,
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null,
      daysOverdue,
      agingBucket: agingBucket(invoice.dueDate, now),
    };
  });

  res.json({ results, total: results.length });
});
