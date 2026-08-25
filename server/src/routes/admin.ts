import { Router } from "express";
import { adminAuditLogQuerySchema } from "@billa/shared";
import type { AdminAuditLogQuery } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { validateQuery } from "../middleware/validate-query.js";

export const adminRouter = Router();

adminRouter.use(requireAuth);
adminRouter.use(requireAdmin);

adminRouter.get("/audit-log", validateQuery(adminAuditLogQuerySchema), async (req, res) => {
  const query = req.listQuery as AdminAuditLogQuery;

  const [results, total] = await Promise.all([
    prisma.adminAuditLogEntry.findMany({
      orderBy: { createdAt: query.sortOrder },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { admin: { select: { id: true, email: true } } },
    }),
    prisma.adminAuditLogEntry.count(),
  ]);

  res.json({ results, total, page: query.page, pageSize: query.pageSize });
});
