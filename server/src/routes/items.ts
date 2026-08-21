import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { itemListQuerySchema, itemSchema, itemUpdateSchema } from "@billa/shared";
import type { ItemListQuery } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireActiveSubscription } from "../middleware/require-active-subscription.js";
import { validateBody } from "../middleware/validate.js";
import { validateQuery } from "../middleware/validate-query.js";

export const itemsRouter = Router();

itemsRouter.use(requireAuth);
itemsRouter.use(requireActiveSubscription);

itemsRouter.get("/", validateQuery(itemListQuerySchema), async (req, res) => {
  const query = req.listQuery as ItemListQuery;
  const businessId = req.auth!.businessId;

  const where: Prisma.ItemWhereInput = {
    businessId,
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.search ? { description: { contains: query.search, mode: "insensitive" } } : {}),
  };

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
