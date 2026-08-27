import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireActiveSubscription } from "../middleware/require-active-subscription.js";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);
reportsRouter.use(requireActiveSubscription);

function endOfDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

reportsRouter.get("/tax-summary", async (req, res) => {
  const businessId = req.auth!.businessId;
  const from = typeof req.query.from === "string" && req.query.from ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === "string" && req.query.to ? new Date(req.query.to) : undefined;

  const lines = await prisma.documentLine.findMany({
    where: {
      document: {
        businessId,
        status: "FINALIZED",
        type: { in: ["INVOICE", "CREDIT_NOTE"] },
        ...(from || to
          ? {
              issueDate: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lt: endOfDay(to) } : {}),
              },
            }
          : {}),
      },
    },
    include: { document: { select: { type: true } } },
  });

  const byRate = new Map<number, { taxableAmount: number; taxAmount: number }>();
  let totalTaxInvoiced = 0;
  let totalTaxCredited = 0;

  for (const line of lines) {
    const rawSubtotal = Math.round(Number(line.quantity) * line.unitPrice);
    const taxAmount = Math.round(rawSubtotal * (Number(line.taxRate) / 100));
    const sign = line.document.type === "INVOICE" ? 1 : -1;
    const rate = Number(line.taxRate);

    const bucket = byRate.get(rate) ?? { taxableAmount: 0, taxAmount: 0 };
    bucket.taxableAmount += sign * rawSubtotal;
    bucket.taxAmount += sign * taxAmount;
    byRate.set(rate, bucket);

    if (line.document.type === "INVOICE") {
      totalTaxInvoiced += taxAmount;
    } else {
      totalTaxCredited += taxAmount;
    }
  }

  res.json({
    from: from ? from.toISOString().slice(0, 10) : null,
    to: to ? to.toISOString().slice(0, 10) : null,
    totalTaxInvoiced,
    totalTaxCredited,
    totalTaxCollected: totalTaxInvoiced - totalTaxCredited,
    byRate: Array.from(byRate.entries())
      .map(([rate, amounts]) => ({ rate, ...amounts }))
      .sort((a, b) => a.rate - b.rate),
  });
});
