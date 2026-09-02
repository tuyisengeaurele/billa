import { Router } from "express";
import type { Prisma } from "@prisma/client";
import {
  adminAuditLogQuerySchema,
  adminBusinessListQuerySchema,
  adminUserListQuerySchema,
  extendTrialSchema,
  postAnnouncementSchema,
  renameBusinessSchema,
} from "@billa/shared";
import type {
  AdminAuditLogQuery,
  AdminBusinessListQuery,
  AdminUserListQuery,
  ExtendTrialInput,
  PostAnnouncementInput,
  RenameBusinessInput,
} from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { validateBody } from "../middleware/validate.js";
import { validateQuery } from "../middleware/validate-query.js";
import { logAdminAction } from "../lib/admin-audit-log.js";
import { toCsv } from "../lib/csv.js";
import { deleteBusinessCascade, deleteUserCascade } from "../lib/delete-business.js";
import { checkMailerHealth } from "../lib/mailer.js";
import { checkFirebaseAdminHealth } from "../lib/firebase-admin.js";
import { checkPdfRenderingHealth } from "../lib/pdf/browser.js";

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
  name: true,
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
    { key: "name", header: "Name" },
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

adminRouter.delete("/users/:id", async (req, res) => {
  const { id } = req.params;

  if (id === req.auth!.userId) {
    res.status(400).json({ error: "cannot_delete_self" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const [adminActionCount, announcementCount] = await Promise.all([
    prisma.adminAuditLogEntry.count({ where: { adminUserId: id } }),
    prisma.announcement.count({ where: { createdById: id } }),
  ]);
  if (adminActionCount > 0 || announcementCount > 0) {
    res.status(409).json({ error: "has_admin_history" });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await deleteUserCascade(tx, id);
  });

  await logAdminAction({
    adminUserId: req.auth!.userId,
    action: "USER_DELETED",
    targetType: "User",
    targetId: id,
    metadata: { email: user.email },
  });

  res.json({ ok: true });
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

adminRouter.get("/users/:id/sessions", async (req, res) => {
  const { id } = req.params;

  const results = await prisma.refreshToken.findMany({
    where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });

  res.json({ results });
});

adminRouter.post("/users/:id/sessions/:sessionId/revoke", async (req, res) => {
  const { id, sessionId } = req.params;

  const session = await prisma.refreshToken.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== id) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  await prisma.refreshToken.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });

  await logAdminAction({
    adminUserId: req.auth!.userId,
    action: "SESSION_REVOKED",
    targetType: "User",
    targetId: id,
    metadata: { sessionId },
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
    dailyDocuments30d,
    planGroups,
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
    prisma.$queryRaw<{ date: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS date, COUNT(*) AS count
      FROM "Document"
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY date_trunc('day', "createdAt")
      ORDER BY date ASC
    `,
    prisma.user.groupBy({ by: ["plan"], _count: { _all: true } }),
  ]);

  const planDistribution = planGroups.map((g) => ({
    plan: g.plan ?? "NONE",
    count: g._count._all,
  }));

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
    dailyDocuments30d: dailyDocuments30d.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      count: Number(row.count),
    })),
    planDistribution,
  });
});

const EMAIL_DAILY_LIMIT = 500;

adminRouter.get("/system-health", async (_req, res) => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [latestRuns, dbCheck, emailCheck, firebaseCheck, pdfCheck, emailsSentLast24h] = await Promise.all([
    prisma.jobRunLog.findMany({ orderBy: { ranAt: "desc" } }),
    prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    ),
    checkMailerHealth(),
    checkFirebaseAdminHealth(),
    checkPdfRenderingHealth(),
    prisma.emailSendLog.count({ where: { sentAt: { gte: oneDayAgo } } }),
  ]);

  const jobs = new Map<string, (typeof latestRuns)[number]>();
  for (const run of latestRuns) {
    if (!jobs.has(run.jobName)) {
      jobs.set(run.jobName, run);
    }
  }

  res.json({
    dbConnected: dbCheck,
    emailConnected: emailCheck,
    firebaseConnected: firebaseCheck,
    pdfRenderingConnected: pdfCheck,
    emailsSentLast24h,
    emailDailyLimit: EMAIL_DAILY_LIMIT,
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

adminRouter.patch("/businesses/:id", validateBody(renameBusinessSchema), async (req, res) => {
  const { id } = req.params;
  const { name } = req.body as RenameBusinessInput;

  const business = await prisma.business.findUnique({ where: { id } });
  if (!business) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const updated = await prisma.business.update({ where: { id }, data: { name } });

  await logAdminAction({
    adminUserId: req.auth!.userId,
    action: "BUSINESS_RENAMED",
    targetType: "Business",
    targetId: id,
    metadata: { from: business.name, to: name },
  });

  res.json({ business: updated });
});

adminRouter.delete("/businesses/:id", async (req, res) => {
  const { id } = req.params;

  const business = await prisma.business.findUnique({ where: { id } });
  if (!business) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await deleteBusinessCascade(tx, id);
  });

  await logAdminAction({
    adminUserId: req.auth!.userId,
    action: "BUSINESS_DELETED",
    targetType: "Business",
    targetId: id,
    metadata: { name: business.name },
  });

  res.json({ ok: true });
});
