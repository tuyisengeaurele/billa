import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { issueSession } from "../lib/session.js";
import { acceptInviteForUser } from "../lib/accept-invite.js";
import { generalApiRateLimit } from "../middleware/general-rate-limit.js";
import { publicDocumentRateLimit } from "../middleware/public-document-rate-limit.js";

export const invitesRouter = Router();

invitesRouter.get("/:token", publicDocumentRateLimit, async (req, res) => {
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

invitesRouter.post("/:token/accept", requireAuth, generalApiRateLimit, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
  const result = await acceptInviteForUser(req.params.token, user);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  await issueSession(res, user.id, result.business.id);
  res.json({
    business: {
      id: result.business.id,
      name: result.business.name,
      onboardingCompletedAt: result.business.onboardingCompletedAt,
    },
  });
});
