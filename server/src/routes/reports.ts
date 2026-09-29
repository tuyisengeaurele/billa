import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireBusinessContext } from "../middleware/require-business.js";
import { requireActiveSubscription } from "../middleware/require-active-subscription.js";
import { expensiveOperationRateLimit } from "../middleware/general-rate-limit.js";
import { toCsv } from "../lib/csv.js";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);
reportsRouter.use(requireBusinessContext);
reportsRouter.use(expensiveOperationRateLimit);
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
    // The stored line total is already net of any line discount, which is the amount VAT is charged on.
    const rawSubtotal = line.lineTotal;
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

const REGISTER_TYPE_LABELS = { INVOICE: "Invoice", CREDIT_NOTE: "Credit note" } as const;

// One row per invoice and credit note, in the shape an accountant files a VAT return from.
// Credit notes are negative so a column total is the net figure for the period.
reportsRouter.get("/vat-register.csv", async (req, res) => {
  const businessId = req.auth!.businessId;
  const from = typeof req.query.from === "string" && req.query.from ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === "string" && req.query.to ? new Date(req.query.to) : undefined;

  const documents = await prisma.document.findMany({
    where: {
      businessId,
      status: "FINALIZED",
      type: { in: ["INVOICE", "CREDIT_NOTE"] },
      ...(from || to
        ? { issueDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: endOfDay(to) } : {}) } }
        : {}),
    },
    include: { customer: { select: { name: true, tin: true } } },
    orderBy: [{ issueDate: "asc" }, { number: "asc" }],
  });

  const csv = toCsv(
    documents.map((document) => {
      const sign = document.type === "CREDIT_NOTE" ? -1 : 1;
      return {
        date: document.issueDate.toISOString().slice(0, 10),
        number: document.number ?? "",
        type: REGISTER_TYPE_LABELS[document.type as keyof typeof REGISTER_TYPE_LABELS],
        customer: document.customer.name,
        tin: document.customer.tin ?? "",
        net: sign * document.subtotal,
        vat: sign * document.taxTotal,
        total: sign * document.total,
      };
    }),
    [
      { key: "date", header: "Date" },
      { key: "number", header: "Number" },
      { key: "type", header: "Type" },
      { key: "customer", header: "Customer" },
      { key: "tin", header: "Customer TIN" },
      { key: "net", header: "Net" },
      { key: "vat", header: "VAT" },
      { key: "total", header: "Total" },
    ],
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="vat-register.csv"');
  res.send(csv);
});
