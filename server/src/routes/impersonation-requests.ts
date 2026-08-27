import { Router, type Response } from "express";
import type { ImpersonationRequest } from "@prisma/client";
import { createImpersonationRequestSchema, overrideImpersonationRequestSchema } from "@billa/shared";
import type { CreateImpersonationRequestInput, OverrideImpersonationRequestInput } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate.js";
import { issueSession } from "../lib/session.js";
import { logAdminAction } from "../lib/admin-audit-log.js";
import { logActivity } from "../lib/activity-log.js";

export const impersonationRequestsRouter = Router();

impersonationRequestsRouter.use(requireAuth);

const REQUEST_TTL_MS = 2 * 60 * 1000;

type EffectiveStatus = "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" | "OVERRIDDEN";

function effectiveStatus(request: { status: string; expiresAt: Date }, now: Date): EffectiveStatus {
  if (request.status === "PENDING" && request.expiresAt < now) return "EXPIRED";
  return request.status as EffectiveStatus;
}

impersonationRequestsRouter.post("/", validateBody(createImpersonationRequestSchema), async (req, res) => {
  const requesterId = req.auth!.userId;
  const body = req.body as CreateImpersonationRequestInput;

  if (req.auth!.impersonatedBy) {
    res.status(409).json({ error: "already_impersonating" });
    return;
  }
  if (body.targetUserId === requesterId) {
    res.status(400).json({ error: "cannot_impersonate_self" });
    return;
  }

  const [requester, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: requesterId } }),
    prisma.user.findUnique({ where: { id: body.targetUserId } }),
  ]);
  if (!requester) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  if (!target) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  let businessId: string;
  if (requester.isAdmin) {
    let targetBusinessId = target.lastActiveBusinessId;
    if (!targetBusinessId) {
      const firstBusiness = await prisma.business.findFirst({
        where: { ownerId: target.id },
        orderBy: { createdAt: "asc" },
      });
      if (!firstBusiness) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      targetBusinessId = firstBusiness.id;
    }
    businessId = targetBusinessId;
  } else {
    const business = await prisma.business.findUnique({ where: { id: req.auth!.businessId } });
    if (!business || business.ownerId !== requesterId) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const membership = await prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId: business.id, userId: target.id } },
    });
    if (!membership) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    businessId = business.id;
  }

  const now = new Date();
  const existingPending = await prisma.impersonationRequest.findFirst({
    where: { requesterId, status: "PENDING", expiresAt: { gt: now } },
  });
  if (existingPending) {
    res.status(409).json({ error: "already_pending" });
    return;
  }

  const request = await prisma.impersonationRequest.create({
    data: {
      requesterId,
      targetUserId: target.id,
      businessId,
      reason: body.reason,
      expiresAt: new Date(now.getTime() + REQUEST_TTL_MS),
    },
  });

  res.status(201).json({ request: { id: request.id, status: request.status, expiresAt: request.expiresAt } });
});

impersonationRequestsRouter.get("/pending-for-me", async (req, res) => {
  const now = new Date();
  const request = await prisma.impersonationRequest.findFirst({
    where: { targetUserId: req.auth!.userId, status: "PENDING", expiresAt: { gt: now } },
    orderBy: { requestedAt: "desc" },
    include: { requester: { select: { name: true, email: true } } },
  });

  if (!request) {
    res.json({ request: null });
    return;
  }

  res.json({
    request: {
      id: request.id,
      requesterName: request.requester.name ?? request.requester.email,
      reason: request.reason,
      expiresAt: request.expiresAt,
    },
  });
});

impersonationRequestsRouter.post("/:id/approve", async (req, res) => {
  const { id } = req.params;
  const now = new Date();

  const request = await prisma.impersonationRequest.findUnique({ where: { id } });
  if (!request || request.targetUserId !== req.auth!.userId) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (effectiveStatus(request, now) !== "PENDING") {
    res.status(409).json({ error: "not_pending" });
    return;
  }

  await prisma.impersonationRequest.update({
    where: { id },
    data: { status: "APPROVED", respondedAt: now },
  });

  res.json({ ok: true });
});

impersonationRequestsRouter.post("/:id/deny", async (req, res) => {
  const { id } = req.params;
  const now = new Date();

  const request = await prisma.impersonationRequest.findUnique({ where: { id } });
  if (!request || request.targetUserId !== req.auth!.userId) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (effectiveStatus(request, now) !== "PENDING") {
    res.status(409).json({ error: "not_pending" });
    return;
  }

  await prisma.impersonationRequest.update({
    where: { id },
    data: { status: "DENIED", respondedAt: now },
  });

  res.json({ ok: true });
});

impersonationRequestsRouter.get("/:id", async (req, res) => {
  const { id } = req.params;

  const request = await prisma.impersonationRequest.findUnique({ where: { id } });
  if (!request || request.requesterId !== req.auth!.userId) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  res.json({ status: effectiveStatus(request, new Date()) });
});

async function redeemRequest(res: Response, request: ImpersonationRequest) {
  await issueSession(res, request.targetUserId, request.businessId, request.requesterId);
  await prisma.impersonationRequest.update({ where: { id: request.id }, data: { redeemedAt: new Date() } });

  const requester = await prisma.user.findUnique({ where: { id: request.requesterId } });
  if (requester?.isAdmin) {
    const target = await prisma.user.findUnique({ where: { id: request.targetUserId } });
    await logAdminAction({
      adminUserId: request.requesterId,
      action: request.status === "OVERRIDDEN" ? "IMPERSONATION_OVERRIDDEN" : "IMPERSONATION_STARTED",
      targetType: "User",
      targetId: request.targetUserId,
      metadata: { email: target?.email },
    });
  } else {
    const target = await prisma.user.findUnique({ where: { id: request.targetUserId } });
    await logActivity({
      businessId: request.businessId,
      actorUserId: request.requesterId,
      action: "MEMBER_IMPERSONATION_STARTED",
      entityType: "User",
      entityId: request.targetUserId,
      metadata: { email: target?.email },
    });
  }
}

impersonationRequestsRouter.post("/:id/redeem", async (req, res) => {
  const { id } = req.params;
  const now = new Date();

  const request = await prisma.impersonationRequest.findUnique({ where: { id } });
  if (!request || request.requesterId !== req.auth!.userId) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (request.redeemedAt) {
    res.status(409).json({ error: "already_redeemed" });
    return;
  }
  if (effectiveStatus(request, now) !== "APPROVED") {
    res.status(409).json({ error: "not_approved" });
    return;
  }

  await redeemRequest(res, request);
  res.json({ ok: true });
});

impersonationRequestsRouter.post(
  "/:id/override",
  validateBody(overrideImpersonationRequestSchema),
  async (req, res) => {
    const { id } = req.params;
    const body = req.body as OverrideImpersonationRequestInput;
    const now = new Date();

    const request = await prisma.impersonationRequest.findUnique({ where: { id } });
    if (!request || request.requesterId !== req.auth!.userId) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const requester = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!requester?.isAdmin) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (request.redeemedAt) {
      res.status(409).json({ error: "already_redeemed" });
      return;
    }
    if (effectiveStatus(request, now) !== "EXPIRED") {
      res.status(409).json({ error: "not_expired" });
      return;
    }

    const overridden = await prisma.impersonationRequest.update({
      where: { id },
      data: { status: "OVERRIDDEN", overrideReason: body.overrideReason },
    });

    await redeemRequest(res, overridden);
    res.json({ ok: true });
  },
);
