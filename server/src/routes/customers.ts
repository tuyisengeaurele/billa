import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { customerListQuerySchema, customerSchema, customerUpdateSchema } from "@billa/shared";
import type { CustomerListQuery } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireActiveSubscription } from "../middleware/require-active-subscription.js";
import { blockAccountantMutations } from "../middleware/block-accountant-mutations.js";
import { validateBody } from "../middleware/validate.js";
import { validateQuery } from "../middleware/validate-query.js";
import { logActivity } from "../lib/activity-log.js";
import { toCsv } from "../lib/csv.js";

export const customersRouter = Router();

customersRouter.use(requireAuth);
customersRouter.use(requireActiveSubscription);
customersRouter.use(blockAccountantMutations);

function buildCustomersWhere(businessId: string, query: CustomerListQuery): Prisma.CustomerWhereInput {
  return {
    businessId,
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
  };
}

customersRouter.get("/", validateQuery(customerListQuerySchema), async (req, res) => {
  const query = req.listQuery as CustomerListQuery;
  const businessId = req.auth!.businessId;

  const where = buildCustomersWhere(businessId, query);

  const [results, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder } as Prisma.CustomerOrderByWithRelationInput,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  res.json({ results, total, page: query.page, pageSize: query.pageSize });
});

customersRouter.get("/export.csv", validateQuery(customerListQuerySchema), async (req, res) => {
  const query = req.listQuery as CustomerListQuery;
  const businessId = req.auth!.businessId;

  const customers = await prisma.customer.findMany({
    where: buildCustomersWhere(businessId, query),
    orderBy: { name: "asc" },
  });

  const csv = toCsv(
    customers.map((c) => ({
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      tin: c.tin ?? "",
      status: c.isActive ? "Active" : "Inactive",
    })),
    [
      { key: "name", header: "Name" },
      { key: "phone", header: "Phone" },
      { key: "email", header: "Email" },
      { key: "tin", header: "TIN" },
      { key: "status", header: "Status" },
    ],
  );

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="customers.csv"');
  res.send(csv);
});

customersRouter.get("/:id", async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const customer = await prisma.customer.findFirst({ where: { id, businessId } });
  if (!customer) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  res.json({ customer });
});

customersRouter.get("/:id/payment-stats", async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const customer = await prisma.customer.findFirst({ where: { id, businessId } });
  if (!customer) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const paidInvoices = await prisma.document.findMany({
    where: {
      businessId,
      customerId: id,
      type: "INVOICE",
      status: "FINALIZED",
      paymentStatus: "PAID",
      dueDate: { not: null },
    },
    select: {
      dueDate: true,
      payments: {
        where: { voidedAt: null },
        orderBy: { paidOn: "desc" },
        take: 1,
        select: { paidOn: true },
      },
    },
  });

  const daysToPay = paidInvoices
    .filter((doc) => doc.payments.length > 0)
    .map((doc) => {
      const msPerDay = 24 * 60 * 60 * 1000;
      return Math.round((doc.payments[0]!.paidOn.getTime() - doc.dueDate!.getTime()) / msPerDay);
    });

  const paidInvoiceCount = daysToPay.length;
  const averageDaysToPay =
    paidInvoiceCount > 0 ? Math.round(daysToPay.reduce((sum, days) => sum + days, 0) / paidInvoiceCount) : null;
  const onTimeRate =
    paidInvoiceCount > 0
      ? Math.round((daysToPay.filter((days) => days <= 0).length / paidInvoiceCount) * 100)
      : null;

  res.json({ paidInvoiceCount, averageDaysToPay, onTimeRate });
});

customersRouter.post("/", validateBody(customerSchema), async (req, res) => {
  const customer = await prisma.customer.create({
    data: { ...req.body, businessId: req.auth!.businessId },
  });

  await logActivity({
    businessId: req.auth!.businessId,
    actorUserId: req.auth!.userId,
    action: "CUSTOMER_CREATED",
    entityType: "Customer",
    entityId: customer.id,
    metadata: { name: customer.name },
  });

  res.status(201).json({ customer });
});

customersRouter.patch("/:id", validateBody(customerUpdateSchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const result = await prisma.customer.updateMany({
    where: { id, businessId },
    data: req.body,
  });

  if (result.count === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const customer = await prisma.customer.findUnique({ where: { id } });

  if (req.body.isActive === false) {
    await logActivity({
      businessId,
      actorUserId: req.auth!.userId,
      action: "CUSTOMER_DEACTIVATED",
      entityType: "Customer",
      entityId: id,
      metadata: customer ? { name: customer.name } : undefined,
    });
  }

  res.json({ customer });
});
