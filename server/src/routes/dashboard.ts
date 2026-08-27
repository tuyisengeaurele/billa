import { Router } from "express";
import { DOCUMENT_TYPES } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { getOutstandingInvoices } from "../lib/accounts-receivable.js";
import { requireAuth } from "../middleware/require-auth.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

function startOfMonth(date: Date, monthsAgo: number): Date {
  return new Date(date.getFullYear(), date.getMonth() - monthsAgo, 1);
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

dashboardRouter.get("/summary", async (req, res) => {
  const businessId = req.auth!.businessId;
  const now = new Date();
  const startOfThisMonth = startOfMonth(now, 0);
  const startOfLastMonth = startOfMonth(now, 1);
  const fourteenDaysAgo = utcMidnight(now);
  fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 13);

  const [
    draftCount,
    overdueInvoiceCount,
    recentDocuments,
    documentsThisMonth,
    documentsLastMonth,
    documentsByTypeRaw,
    recentForActivity,
    customerCount,
    business,
  ] = await Promise.all([
    prisma.document.count({ where: { businessId, status: "DRAFT" } }),
    prisma.document.count({
      where: { businessId, type: "INVOICE", status: "FINALIZED", dueDate: { lt: new Date() } },
    }),
    prisma.document.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { customer: { select: { name: true } } },
    }),
    prisma.document.count({ where: { businessId, createdAt: { gte: startOfThisMonth } } }),
    prisma.document.count({
      where: { businessId, createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } },
    }),
    prisma.document.groupBy({ by: ["type"], where: { businessId }, _count: { _all: true } }),
    prisma.document.findMany({
      where: { businessId, createdAt: { gte: fourteenDaysAgo } },
      select: { createdAt: true },
    }),
    prisma.customer.count({ where: { businessId } }),
    prisma.business.findUnique({ where: { id: businessId }, select: { logoUrl: true } }),
  ]);

  const countsByType = new Map(documentsByTypeRaw.map((row) => [row.type, row._count._all]));
  const documentsByType = DOCUMENT_TYPES.map((type) => ({ type, count: countsByType.get(type) ?? 0 }));

  const countsByDay = new Map<string, number>();
  for (const doc of recentForActivity) {
    const key = dayKey(doc.createdAt);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
  }
  const activityByDay = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(fourteenDaysAgo);
    date.setUTCDate(date.getUTCDate() + i);
    const key = dayKey(date);
    return { date: key, count: countsByDay.get(key) ?? 0 };
  });

  res.json({
    draftCount,
    overdueInvoiceCount,
    recentDocuments: recentDocuments.map((doc) => ({
      id: doc.id,
      type: doc.type,
      number: doc.number,
      status: doc.status,
      customerName: doc.customer.name,
      issueDate: doc.issueDate,
    })),
    documentsThisMonth,
    documentsLastMonth,
    documentsByType,
    activityByDay,
    customerCount,
    hasLogo: Boolean(business?.logoUrl),
  });
});

dashboardRouter.get("/revenue", async (req, res) => {
  const businessId = req.auth!.businessId;
  const now = new Date();
  const windowStart = startOfMonth(now, 11);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const docs = await prisma.document.findMany({
    where: {
      businessId,
      status: "FINALIZED",
      type: { in: ["INVOICE", "CREDIT_NOTE"] },
      issueDate: { gte: windowStart },
    },
    select: {
      type: true,
      total: true,
      issueDate: true,
      customerId: true,
      customer: { select: { name: true } },
    },
  });

  const monthTotals = new Map<string, { invoiced: number; credited: number }>();
  for (let i = 5; i >= 0; i--) {
    monthTotals.set(monthKey(startOfMonth(now, i)), { invoiced: 0, credited: 0 });
  }

  let invoicedYearToDate = 0;
  let creditedYearToDate = 0;
  const customerNet = new Map<string, { name: string; total: number }>();

  for (const doc of docs) {
    const bucket = monthTotals.get(monthKey(doc.issueDate));
    if (bucket) {
      if (doc.type === "INVOICE") bucket.invoiced += doc.total;
      else bucket.credited += doc.total;
    }

    if (doc.issueDate >= startOfYear) {
      if (doc.type === "INVOICE") invoicedYearToDate += doc.total;
      else creditedYearToDate += doc.total;
    }

    const signedTotal = doc.type === "INVOICE" ? doc.total : -doc.total;
    const existing = customerNet.get(doc.customerId) ?? { name: doc.customer.name, total: 0 };
    existing.total += signedTotal;
    customerNet.set(doc.customerId, existing);
  }

  const monthlyRevenue = Array.from(monthTotals.entries()).map(([month, { invoiced, credited }]) => ({
    month,
    invoiced,
    credited,
    net: invoiced - credited,
  }));

  const invoicedThisMonth = monthTotals.get(monthKey(startOfMonth(now, 0)))?.invoiced ?? 0;
  const invoicedLastMonth = monthTotals.get(monthKey(startOfMonth(now, 1)))?.invoiced ?? 0;

  const topCustomers = Array.from(customerNet.entries())
    .map(([customerId, { name, total }]) => ({ customerId, name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const [collectedPayments, outstandingInvoices, ninetyDayPaidInvoices] = await Promise.all([
    prisma.invoicePayment.findMany({
      where: { businessId, voidedAt: null, paidOn: { gte: windowStart } },
      select: { amount: true },
    }),
    getOutstandingInvoices(businessId),
    prisma.document.findMany({
      where: { businessId, type: "INVOICE", status: "FINALIZED", paymentStatus: "PAID" },
      select: {
        issueDate: true,
        payments: { where: { voidedAt: null }, orderBy: { paidOn: "desc" }, take: 1, select: { paidOn: true } },
      },
    }),
  ]);

  const totalCollected = collectedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalOutstanding = outstandingInvoices.reduce((sum, invoice) => sum + invoice.amountOwed, 0);

  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const dsoSamples: number[] = [];
  for (const invoice of ninetyDayPaidInvoices) {
    const lastPayment = invoice.payments[0];
    if (!lastPayment || lastPayment.paidOn < ninetyDaysAgo) continue;
    dsoSamples.push(Math.round((lastPayment.paidOn.getTime() - invoice.issueDate.getTime()) / (24 * 60 * 60 * 1000)));
  }
  const daysSalesOutstanding =
    dsoSamples.length > 0 ? Math.round(dsoSamples.reduce((sum, days) => sum + days, 0) / dsoSamples.length) : null;

  res.json({
    invoicedThisMonth,
    invoicedLastMonth,
    invoicedYearToDate,
    creditedYearToDate,
    netYearToDate: invoicedYearToDate - creditedYearToDate,
    totalCollected,
    totalOutstanding,
    daysSalesOutstanding,
    monthlyRevenue,
    topCustomers,
  });
});
