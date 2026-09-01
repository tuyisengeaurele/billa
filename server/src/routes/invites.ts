import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { issueSession } from "../lib/session.js";
import { logActivity } from "../lib/activity-log.js";
import { createNotification } from "../lib/notifications.js";

export const invitesRouter = Router();

invitesRouter.get("/:token", async (req, res) => {
  const invite = await prisma.businessInvite.findUnique({ where: { token: req.params.token } });
  if (!invite) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const business = await prisma.business.findUniqueOrThrow({ where: { id: invite.businessId } });
  res.json({
    email: invite.email,
    businessName: business.name,
    expired: invite.expiresAt < new Date(),
    alreadyAccepted: invite.acceptedAt !== null,
  });
});

invitesRouter.post("/:token/accept", requireAuth, async (req, res) => {
  const invite = await prisma.businessInvite.findUnique({ where: { token: req.params.token } });
  if (!invite) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (invite.acceptedAt) {
    res.status(409).json({ error: "already_accepted" });
    return;
  }
  if (invite.expiresAt < new Date()) {
    res.status(410).json({ error: "expired" });
    return;
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    res.status(403).json({ error: "email_mismatch" });
    return;
  }

  const [membership] = await prisma.$transaction([
    prisma.businessMember.upsert({
      where: { businessId_userId: { businessId: invite.businessId, userId: user.id } },
      create: { businessId: invite.businessId, userId: user.id, role: invite.role },
      update: {},
    }),
    prisma.businessInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
    prisma.user.update({ where: { id: user.id }, data: { lastActiveBusinessId: invite.businessId } }),
  ]);

  await logActivity({
    businessId: invite.businessId,
    actorUserId: user.id,
    action: "MEMBER_JOINED",
    entityType: "BusinessMember",
    entityId: membership.id,
    metadata: { email: user.email },
  });

  const business = await prisma.business.findUniqueOrThrow({ where: { id: invite.businessId } });

  await createNotification({
    userId: business.ownerId,
    type: "MEMBER_JOINED",
    title: `${user.email} joined your team`,
    link: "/settings",
  });

  await issueSession(res, user.id, invite.businessId);
  res.json({
    business: { id: business.id, name: business.name, onboardingCompletedAt: business.onboardingCompletedAt },
  });
});
