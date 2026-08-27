import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireActiveSubscription } from "../middleware/require-active-subscription.js";

export const exportRouter = Router();

exportRouter.use(requireAuth);
exportRouter.use(requireActiveSubscription);

exportRouter.get("/all", async (req, res) => {
  const businessId = req.auth!.businessId;

  const [documents, customers, items] = await Promise.all([
    prisma.document.findMany({
      where: { businessId },
      orderBy: { issueDate: "desc" },
      include: { customer: { select: { name: true } } },
    }),
    prisma.customer.findMany({ where: { businessId }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ where: { businessId }, orderBy: { description: "asc" } }),
  ]);

  res.json({
    exportedAt: new Date().toISOString(),
    documents: documents.map((doc) => ({
      type: doc.type,
      number: doc.number ?? "Draft",
      status: doc.status,
      customer: doc.customer.name,
      issueDate: doc.issueDate.toISOString().slice(0, 10),
      dueDate: doc.dueDate ? doc.dueDate.toISOString().slice(0, 10) : null,
      total: doc.total,
    })),
    customers: customers.map((customer) => ({
      name: customer.name,
      tin: customer.tin,
      address: customer.address,
      phone: customer.phone,
      email: customer.email,
      isActive: customer.isActive,
    })),
    items: items.map((item) => ({
      description: item.description,
      unitPrice: item.unitPrice,
      unit: item.unit,
      isActive: item.isActive,
    })),
  });
});
