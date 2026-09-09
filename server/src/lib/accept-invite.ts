import type { Business, User } from "@prisma/client";
import { prisma } from "./prisma.js";
import { logActivity } from "./activity-log.js";
import { createNotification } from "./notifications.js";

export type AcceptInviteResult = { ok: true; business: Business } | { ok: false; status: number; error: string };

/**
 * Joins `user` into the business behind `token`, or reports why it couldn't.
 * Shared by the "accept an invite while already signed in" route and by
 * registration's invite-aware path (see POST /auth/session), so both go through
 * exactly the same membership/notification logic.
 */
export async function acceptInviteForUser(token: string, user: User): Promise<AcceptInviteResult> {
  const invite = await prisma.businessInvite.findUnique({ where: { token } });
  if (!invite) {
    return { ok: false, status: 404, error: "not_found" };
  }
  if (invite.acceptedAt) {
    return { ok: false, status: 409, error: "already_accepted" };
  }
  if (invite.expiresAt < new Date()) {
    return { ok: false, status: 410, error: "expired" };
  }
  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return { ok: false, status: 403, error: "email_mismatch" };
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
    title: `${user.name ?? user.email} joined your team`,
    link: "/settings",
  });

  return { ok: true, business };
}
