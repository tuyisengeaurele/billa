import { Router } from "express";
import { DOCUMENT_TYPES } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
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
