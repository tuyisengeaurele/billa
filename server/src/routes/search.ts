import { Router } from "express";
import { formatRwf, searchQuerySchema } from "@billa/shared";
import type { SearchQuery } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireActiveSubscription } from "../middleware/require-active-subscription.js";
import { validateQuery } from "../middleware/validate-query.js";

export const searchRouter = Router();

searchRouter.use(requireAuth);
searchRouter.use(requireActiveSubscription);

const RESULT_LIMIT = 5;

searchRouter.get("/", validateQuery(searchQuerySchema), async (req, res) => {
  const { q } = req.listQuery as SearchQuery;
  const businessId = req.auth!.businessId;

  const [customers, items, documents] = await Promise.all([
    prisma.customer.findMany({
      where: { businessId, name: { contains: q, mode: "insensitive" } },
      take: RESULT_LIMIT,
      orderBy: { name: "asc" },
    }),
    prisma.item.findMany({
      where: { businessId, description: { contains: q, mode: "insensitive" } },
      take: RESULT_LIMIT,
      orderBy: { description: "asc" },
    }),
    prisma.document.findMany({
      where: {
        businessId,
        OR: [
          { number: { contains: q, mode: "insensitive" } },
          { customer: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      take: RESULT_LIMIT,
      orderBy: { issueDate: "desc" },
      include: { customer: { select: { name: true } } },
    }),
  ]);

  const results = [
    ...customers.map((c) => ({
      type: "customer" as const,
      id: c.id,
      label: c.name,
      sublabel: c.phone ?? c.email ?? "",
      href: `/customers/${c.id}/statement`,
    })),
    ...items.map((i) => ({
      type: "item" as const,
      id: i.id,
      label: i.description,
      sublabel: formatRwf(i.unitPrice),
      href: "/items",
    })),
    ...documents.map((d) => ({
      type: "document" as const,
      id: d.id,
      label: d.number ?? "Draft",
      sublabel: d.customer.name,
      documentType: d.type,
      href: `/documents/${d.id}`,
    })),
  ];

  res.json({ results });
});
