import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { itemListQuerySchema, itemSchema, itemUpdateSchema } from "@billa/shared";
import type { ItemListQuery } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireActiveSubscription } from "../middleware/require-active-subscription.js";
import { blockAccountantMutations } from "../middleware/block-accountant-mutations.js";
import { validateBody } from "../middleware/validate.js";
import { validateQuery } from "../middleware/validate-query.js";
import { toCsv } from "../lib/csv.js";

export const itemsRouter = Router();

itemsRouter.use(requireAuth);
itemsRouter.use(requireActiveSubscription);
itemsRouter.use(blockAccountantMutations);

function buildItemsWhere(businessId: string, query: ItemListQuery): Prisma.ItemWhereInput {
  return {
    businessId,
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.search ? { description: { contains: query.search, mode: "insensitive" } } : {}),
    ...(query.category ? { category: { equals: query.category, mode: "insensitive" } } : {}),
  };
}

itemsRouter.get("/", validateQuery(itemListQuerySchema), async (req, res) => {
  const query = req.listQuery as ItemListQuery;
  const businessId = req.auth!.businessId;

  const where = buildItemsWhere(businessId, query);

  const [results, total] = await Promise.all([
    prisma.item.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder } as Prisma.ItemOrderByWithRelationInput,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.item.count({ where }),
  ]);

  res.json({ results, total, page: query.page, pageSize: query.pageSize });
});

itemsRouter.get("/export.csv", validateQuery(itemListQuerySchema), async (req, res) => {
  const query = req.listQuery as ItemListQuery;
  const businessId = req.auth!.businessId;

  const items = await prisma.item.findMany({
    where: buildItemsWhere(businessId, query),
    orderBy: { description: "asc" },
  });

  const csv = toCsv(
    items.map((item) => ({
      description: item.description,
      category: item.category ?? "",
      unitPrice: item.unitPrice,
      unit: item.unit,
      status: item.isActive ? "Active" : "Inactive",
    })),
    [
      { key: "description", header: "Description" },
      { key: "category", header: "Category" },
      { key: "unitPrice", header: "Unit price" },
      { key: "unit", header: "Unit" },
      { key: "status", header: "Status" },
    ],
  );

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="items.csv"');
  res.send(csv);
});

itemsRouter.post("/", validateBody(itemSchema), async (req, res) => {
  const item = await prisma.item.create({
    data: { ...req.body, businessId: req.auth!.businessId },
  });
  res.status(201).json({ item });
});

itemsRouter.patch("/:id", validateBody(itemUpdateSchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const result = await prisma.item.updateMany({
    where: { id, businessId },
    data: req.body,
  });

  if (result.count === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const item = await prisma.item.findUnique({ where: { id } });
  res.json({ item });
});
