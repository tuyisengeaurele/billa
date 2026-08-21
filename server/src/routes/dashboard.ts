import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get("/summary", async (req, res) => {
  const businessId = req.auth!.businessId;

  const [draftCount, overdueInvoiceCount, recentDocuments] = await Promise.all([
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
  ]);

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
  });
});
