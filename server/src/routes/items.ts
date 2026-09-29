import { Router } from "express";
import type { Prisma } from "@prisma/client";
import {
  importRowsRequestSchema,
  itemListQuerySchema,
  itemSchema,
  itemUpdateSchema,
  parseItemImportRow,
} from "@billa/shared";
import type { ImportRowsRequest, ItemInput, ItemListQuery } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireBusinessContext } from "../middleware/require-business.js";
import { requireActiveSubscription } from "../middleware/require-active-subscription.js";
import { blockAccountantMutations } from "../middleware/block-accountant-mutations.js";
import { generalApiRateLimit } from "../middleware/general-rate-limit.js";
import { validateBody } from "../middleware/validate.js";
import { validateQuery } from "../middleware/validate-query.js";
import { toCsv } from "../lib/csv.js";

export const itemsRouter = Router();

itemsRouter.use(requireAuth);
itemsRouter.use(requireBusinessContext);
itemsRouter.use(generalApiRateLimit);
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

itemsRouter.post("/import", validateBody(importRowsRequestSchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const { rows } = req.body as ImportRowsRequest;

  const key = (description: string, unit: string) => `${description.trim().toLowerCase()}|${unit.trim().toLowerCase()}`;
  const existing = await prisma.item.findMany({ where: { businessId }, select: { description: true, unit: true } });
  const seen = new Set(existing.map((item) => key(item.description, item.unit)));

  const toCreate: ItemInput[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const invalid: { row: number; error: string }[] = [];

  rows.forEach((raw, index) => {
    const row = index + 1;
    const parsed = parseItemImportRow(raw);
    if (!parsed.ok) {
      invalid.push({ row, error: parsed.error });
      return;
    }
    const itemKey = key(parsed.value.description, parsed.value.unit);
    if (seen.has(itemKey)) {
      skipped.push({ row, reason: "Already an item with this description and unit" });
      return;
    }
    seen.add(itemKey);
    toCreate.push(parsed.value);
  });

  if (toCreate.length > 0) {
    await prisma.item.createMany({ data: toCreate.map((item) => ({ ...item, businessId })) });
  }

  res.json({ created: toCreate.length, skipped, invalid });
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
