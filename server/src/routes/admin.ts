import { Router } from "express";
import type { Prisma } from "@prisma/client";
import {
  adminAuditLogQuerySchema,
  adminBusinessListQuerySchema,
  adminUserListQuerySchema,
  extendTrialSchema,
  postAnnouncementSchema,
} from "@billa/shared";
import type {
  AdminAuditLogQuery,
  AdminBusinessListQuery,
  AdminUserListQuery,
  ExtendTrialInput,
  PostAnnouncementInput,
} from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { validateBody } from "../middleware/validate.js";
import { validateQuery } from "../middleware/validate-query.js";
import { logAdminAction } from "../lib/admin-audit-log.js";
import { toCsv } from "../lib/csv.js";
import { issueSession } from "../lib/session.js";

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

const USER_LIST_SELECT = {
  id: true,
  email: true,
  isAdmin: true,
  suspendedAt: true,
  trialEndsAt: true,
  currentPeriodEnd: true,
  plan: true,
  createdAt: true,
} as const;

adminRouter.get("/users", validateQuery(adminUserListQuerySchema), async (req, res) => {
  const query = req.listQuery as AdminUserListQuery;

  const where: Prisma.UserWhereInput = query.search
    ? { email: { contains: query.search, mode: "insensitive" } }
    : {};

  const [results, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: USER_LIST_SELECT,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ results, total, page: query.page, pageSize: query.pageSize });
});

adminRouter.get("/users/export.csv", async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" }, select: USER_LIST_SELECT });

  const csv = toCsv(users, [
    { key: "email", header: "Email" },
    { key: "isAdmin", header: "Admin" },
    { key: "suspendedAt", header: "Suspended" },
    { key: "trialEndsAt", header: "Trial ends" },
    { key: "plan", header: "Plan" },
    { key: "createdAt", header: "Joined" },
  ]);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="users.csv"');
  res.send(csv);
});

adminRouter.get("/users/:id", async (req, res) => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({ where: { id }, select: USER_LIST_SELECT });
  if (!user) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const [ownedBusinesses, memberships] = await Promise.all([
    prisma.business.findMany({ where: { ownerId: id }, select: { id: true, name: true } }),
    prisma.businessMember.findMany({
      where: { userId: id },
      include: { business: { select: { id: true, name: true } } },
    }),
  ]);

  res.json({
    user,
    ownedBusinesses,
    memberBusinesses: memberships.map((m) => m.business),
  });
});

adminRouter.post("/users/:id/toggle-admin", async (req, res) => {
  const { id } = req.params;

  if (id === req.auth!.userId) {
    res.status(400).json({ error: "cannot_modify_self" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const updated = await prisma.user.update({ where: { id }, data: { isAdmin: !user.isAdmin } });

  await logAdminAction({
    adminUserId: req.auth!.userId,
    action: updated.isAdmin ? "ADMIN_GRANTED" : "ADMIN_REVOKED",
    targetType: "User",
    targetId: id,
    metadata: { email: updated.email },
  });

  res.json({ user: { id: updated.id, isAdmin: updated.isAdmin } });
});

adminRouter.post("/users/:id/extend-trial", validateBody(extendTrialSchema), async (req, res) => {
  const { id } = req.params;
  const { days } = req.body as ExtendTrialInput;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const base = user.trialEndsAt > new Date() ? user.trialEndsAt : new Date();
  const newTrialEndsAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  await prisma.user.update({ where: { id }, data: { trialEndsAt: newTrialEndsAt } });

  await logAdminAction({
    adminUserId: req.auth!.userId,
    action: "TRIAL_EXTENDED",
    targetType: "User",
    targetId: id,
    metadata: { days, newTrialEndsAt: newTrialEndsAt.toISOString() },
  });

  res.json({ trialEndsAt: newTrialEndsAt });
});

adminRouter.post("/users/:id/suspend", async (req, res) => {
  const { id } = req.params;

  if (id === req.auth!.userId) {
    res.status(400).json({ error: "cannot_modify_self" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  await prisma.user.update({ where: { id }, data: { suspendedAt: new Date() } });
  await prisma.refreshToken.updateMany({
    where: { userId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await logAdminAction({
    adminUserId: req.auth!.userId,
    action: "ACCOUNT_SUSPENDED",
    targetType: "User",
    targetId: id,
    metadata: { email: user.email },
  });

  res.json({ ok: true });
});

adminRouter.post("/users/:id/reinstate", async (req, res) => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  await prisma.user.update({ where: { id }, data: { suspendedAt: null } });

  await logAdminAction({
    adminUserId: req.auth!.userId,
    action: "ACCOUNT_REINSTATED",
    targetType: "User",
    targetId: id,
    metadata: { email: user.email },
  });

  res.json({ ok: true });
});

adminRouter.post("/users/:id/impersonate", async (req, res) => {
  const { id } = req.params;

  if (req.auth!.impersonatedBy) {
    res.status(409).json({ error: "already_impersonating" });
    return;
  }
  if (id === req.auth!.userId) {
    res.status(400).json({ error: "cannot_impersonate_self" });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  let businessId = target.lastActiveBusinessId;
  if (!businessId) {
    const firstBusiness = await prisma.business.findFirstOrThrow({
      where: { ownerId: target.id },
      orderBy: { createdAt: "asc" },
    });
    businessId = firstBusiness.id;
  }

  await issueSession(res, target.id, businessId, req.auth!.userId);

  await logAdminAction({
    adminUserId: req.auth!.userId,
    action: "IMPERSONATION_STARTED",
    targetType: "User",
    targetId: target.id,
    metadata: { email: target.email },
  });

  res.json({ ok: true });
});

adminRouter.get("/metrics", async (_req, res) => {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    totalBusinesses,
    activeTrials,
    payingAccounts,
    signups7d,
    signups30d,
    documents7d,
    documents30d,
    dailySignups30d,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.business.count(),
    prisma.user.count({ where: { trialEndsAt: { gt: now }, plan: null } }),
    prisma.user.count({ where: { plan: { not: null } } }),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.document.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.document.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.$queryRaw<{ date: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS date, COUNT(*) AS count
      FROM "User"
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY date_trunc('day', "createdAt")
      ORDER BY date ASC
    `,
  ]);

  res.json({
    totalUsers,
    totalBusinesses,
    activeTrials,
    payingAccounts,
    signups7d,
    signups30d,
    documents7d,
    documents30d,
    dailySignups30d: dailySignups30d.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      count: Number(row.count),
    })),
  });
});

adminRouter.get("/system-health", async (_req, res) => {
  const [latestRuns, dbCheck] = await Promise.all([
    prisma.jobRunLog.findMany({ orderBy: { ranAt: "desc" } }),
    prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    ),
  ]);

  const jobs = new Map<string, (typeof latestRuns)[number]>();
  for (const run of latestRuns) {
    if (!jobs.has(run.jobName)) {
      jobs.set(run.jobName, run);
    }
  }

  res.json({
    dbConnected: dbCheck,
    jobs: Array.from(jobs.values()).map((run) => ({
      jobName: run.jobName,
      ranAt: run.ranAt,
      succeeded: run.succeeded,
      resultCount: run.resultCount,
      errorMessage: run.errorMessage,
    })),
  });
});

adminRouter.post("/announcements", validateBody(postAnnouncementSchema), async (req, res) => {
  const { message } = req.body as PostAnnouncementInput;

  await prisma.announcement.updateMany({ where: { active: true }, data: { active: false } });
  const announcement = await prisma.announcement.create({
    data: { message, createdById: req.auth!.userId },
  });

  await logAdminAction({
    adminUserId: req.auth!.userId,
    action: "ANNOUNCEMENT_POSTED",
    targetType: "Announcement",
    targetId: announcement.id,
    metadata: { message },
  });

  res.status(201).json({ announcement });
});

adminRouter.get("/announcements", async (_req, res) => {
  const results = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  res.json({ results });
});

adminRouter.post("/announcements/:id/deactivate", async (req, res) => {
  const { id } = req.params;

  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  await prisma.announcement.update({ where: { id }, data: { active: false } });

  await logAdminAction({
    adminUserId: req.auth!.userId,
    action: "ANNOUNCEMENT_DEACTIVATED",
    targetType: "Announcement",
    targetId: id,
    metadata: {},
  });

  res.json({ ok: true });
});

adminRouter.get("/businesses", validateQuery(adminBusinessListQuerySchema), async (req, res) => {
  const query = req.listQuery as AdminBusinessListQuery;

  const where: Prisma.BusinessWhereInput = query.search
    ? { name: { contains: query.search, mode: "insensitive" } }
    : {};

  const [rows, total] = await Promise.all([
    prisma.business.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        owner: { select: { email: true } },
        _count: { select: { members: true, documents: true } },
      },
    }),
    prisma.business.count({ where }),
  ]);

  res.json({
    results: rows.map((b) => ({
      id: b.id,
      name: b.name,
      ownerEmail: b.owner.email,
      memberCount: b._count.members,
      documentCount: b._count.documents,
      createdAt: b.createdAt,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  });
});

adminRouter.get("/businesses/export.csv", async (_req, res) => {
  const rows = await prisma.business.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { email: true } },
      _count: { select: { members: true, documents: true } },
    },
  });

  const csv = toCsv(
    rows.map((b) => ({
      name: b.name,
      ownerEmail: b.owner.email,
      memberCount: b._count.members,
      documentCount: b._count.documents,
      createdAt: b.createdAt,
    })),
    [
      { key: "name", header: "Name" },
      { key: "ownerEmail", header: "Owner" },
      { key: "memberCount", header: "Members" },
      { key: "documentCount", header: "Documents" },
      { key: "createdAt", header: "Created" },
    ],
  );

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="businesses.csv"');
  res.send(csv);
});

adminRouter.get("/businesses/:id", async (req, res) => {
  const { id } = req.params;

  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, email: true } },
      members: { include: { user: { select: { id: true, email: true } } } },
      _count: { select: { documents: true, customers: true } },
    },
  });
  if (!business) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  res.json({
    business: {
      id: business.id,
      name: business.name,
      createdAt: business.createdAt,
      owner: business.owner,
      members: business.members.map((m) => ({ id: m.user.id, email: m.user.email, joinedAt: m.createdAt })),
      documentCount: business._count.documents,
      customerCount: business._count.customers,
    },
  });
});
