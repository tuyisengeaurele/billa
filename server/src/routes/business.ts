import { Router } from "express";
import multer from "multer";
import type { DocumentType as PrismaDocumentType } from "@prisma/client";
import {
  businessProfileSchema,
  confirmLogoSchema,
  createInviteSchema,
  logoUrlSchema,
  updateSequencesSchema,
} from "@billa/shared";
import type { CreateInviteInput } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireOwner } from "../middleware/require-owner.js";
import { validateBody } from "../middleware/validate.js";
import { mergeSequences } from "../lib/document-sequences.js";
import { detectAllowedImageType } from "../lib/file-sniff.js";
import { getStorage } from "../lib/storage.js";
import { detectBackground } from "../lib/background-detect.js";
import { removeBackground } from "../lib/rembg-client.js";
import { ForbiddenUploadPathError, readUploadedFile } from "../lib/uploaded-file.js";
import { extractPalette } from "../lib/palette.js";
import { sendEmail } from "../lib/resend.js";
import { logActivity } from "../lib/activity-log.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const businessRouter = Router();

businessRouter.use(requireAuth);

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("logo");

businessRouter.get("/", async (req, res) => {
  const business = await prisma.business.findUnique({ where: { id: req.auth!.businessId } });
  if (!business) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ business });
});

businessRouter.get("/sequences", async (req, res) => {
  const saved = await prisma.documentSequence.findMany({ where: { businessId: req.auth!.businessId } });
  res.json({ sequences: mergeSequences(saved) });
});

businessRouter.patch("/", requireOwner, validateBody(businessProfileSchema), async (req, res) => {
  const business = await prisma.business.update({
    where: { id: req.auth!.businessId },
    data: req.body,
  });
  res.json({ business });
});

businessRouter.post("/onboarding/complete", requireOwner, async (req, res) => {
  const business = await prisma.business.update({
    where: { id: req.auth!.businessId },
    data: { onboardingCompletedAt: new Date() },
  });
  res.json({ business });
});

businessRouter.put("/sequences", requireOwner, validateBody(updateSequencesSchema), async (req, res) => {
  const updates = req.body as { type: string; prefix: string; nextNumber: number }[];

  await prisma.$transaction(
    updates.map((update) =>
      prisma.documentSequence.upsert({
        where: {
          businessId_type: {
            businessId: req.auth!.businessId,
            type: update.type as PrismaDocumentType,
          },
        },
        create: {
          businessId: req.auth!.businessId,
          type: update.type as PrismaDocumentType,
          prefix: update.prefix,
          nextNumber: update.nextNumber,
        },
        update: {
          prefix: update.prefix,
          nextNumber: update.nextNumber,
        },
      }),
    ),
  );

  const saved = await prisma.documentSequence.findMany({ where: { businessId: req.auth!.businessId } });
  res.json({ sequences: mergeSequences(saved) });
});

businessRouter.post(
  "/logo",
  requireOwner,
  (req, res, next) => {
    uploadLogo(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: "upload_failed" });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "no_file" });
      return;
    }

    const detected = await detectAllowedImageType(req.file.buffer);
    if (!detected) {
      res.status(400).json({ error: "invalid_file_type" });
      return;
    }

    const { url } = await getStorage().save(req.file.buffer, req.auth!.businessId, detected.ext);
    res.status(201).json({ url });
  },
);

businessRouter.post("/logo/remove-background", requireOwner, validateBody(logoUrlSchema), async (req, res) => {
  const { url } = req.body as { url: string };
  const businessId = req.auth!.businessId;

  let buffer: Buffer;
  try {
    buffer = await readUploadedFile(url, businessId);
  } catch (err) {
    if (err instanceof ForbiddenUploadPathError) {
      res.status(403).json({ error: "forbidden" });
    } else {
      res.status(404).json({ error: "not_found" });
    }
    return;
  }

  const detection = await detectBackground(buffer);

  if (!detection.needsRemoval) {
    res.json({ url, backgroundRemoved: false, detection });
    return;
  }

  const processed = await removeBackground(buffer);
  const saved = await getStorage().save(processed, businessId, "png");
  res.json({ url: saved.url, backgroundRemoved: true, detection });
});

businessRouter.post("/logo/extract-colors", requireOwner, validateBody(logoUrlSchema), async (req, res) => {
  const { url } = req.body as { url: string };
  const businessId = req.auth!.businessId;

  let buffer: Buffer;
  try {
    buffer = await readUploadedFile(url, businessId);
  } catch (err) {
    if (err instanceof ForbiddenUploadPathError) {
      res.status(403).json({ error: "forbidden" });
    } else {
      res.status(404).json({ error: "not_found" });
    }
    return;
  }

  const palette = await extractPalette(buffer);
  res.json(palette);
});

businessRouter.post("/logo/confirm", requireOwner, validateBody(confirmLogoSchema), async (req, res) => {
  const { url, primaryColor, accentColors } = req.body as {
    url: string;
    primaryColor: string;
    accentColors: string[];
  };
  const businessId = req.auth!.businessId;

  try {
    await readUploadedFile(url, businessId);
  } catch (err) {
    if (err instanceof ForbiddenUploadPathError) {
      res.status(403).json({ error: "forbidden" });
    } else {
      res.status(404).json({ error: "not_found" });
    }
    return;
  }

  const business = await prisma.business.update({
    where: { id: businessId },
    data: { logoUrl: url, primaryColor, accentColors },
  });

  res.json({ business });
});

businessRouter.get("/members", requireOwner, async (req, res) => {
  const businessId = req.auth!.businessId;
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: business.ownerId } });
  const memberships = await prisma.businessMember.findMany({
    where: { businessId },
    include: { user: { select: { id: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  res.json({
    members: [
      { id: owner.id, email: owner.email, role: "owner", joinedAt: business.createdAt },
      ...memberships.map((m) => ({ id: m.user.id, email: m.user.email, role: "member", joinedAt: m.createdAt })),
    ],
  });
});

businessRouter.delete("/members/:userId", requireOwner, async (req, res) => {
  const businessId = req.auth!.businessId;
  const { userId } = req.params;

  const removedUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, lastActiveBusinessId: true },
  });

  const deleted = await prisma.businessMember.deleteMany({ where: { businessId, userId } });
  if (deleted.count === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  await prisma.refreshToken.updateMany({
    where: { userId, businessId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (removedUser?.lastActiveBusinessId === businessId) {
    await prisma.user.update({ where: { id: userId }, data: { lastActiveBusinessId: null } });
  }

  await logActivity({
    businessId,
    actorUserId: req.auth!.userId,
    action: "MEMBER_REMOVED",
    entityType: "BusinessMember",
    entityId: userId,
    metadata: removedUser ? { email: removedUser.email } : undefined,
  });

  res.json({ ok: true });
});

businessRouter.get("/invites", requireOwner, async (req, res) => {
  const invites = await prisma.businessInvite.findMany({
    where: { businessId: req.auth!.businessId, acceptedAt: null },
    orderBy: { createdAt: "asc" },
  });
  res.json({
    invites: invites.map((i) => ({ id: i.id, email: i.email, expiresAt: i.expiresAt, createdAt: i.createdAt })),
  });
});

businessRouter.post("/invites", requireOwner, validateBody(createInviteSchema), async (req, res) => {
  const { email } = req.body as CreateInviteInput;
  const businessId = req.auth!.businessId;
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const isOwner = business.ownerId === existingUser.id;
    const isMember = await prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId, userId: existingUser.id } },
    });
    if (isOwner || isMember) {
      res.status(409).json({ error: "already_member" });
      return;
    }
  }

  const invite = await prisma.businessInvite.create({
    data: { businessId, email, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  });

  const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  const link = `${clientOrigin}/invite/${invite.token}`;
  try {
    await sendEmail({
      to: email,
      subject: `You've been invited to join ${business.name} on Billa`,
      html: `<p>You've been invited to join <strong>${business.name}</strong> on Billa.</p><p><a href="${link}">Accept the invite</a></p>`,
    });
  } catch {
    // The invite is already saved; the owner can still share the link manually.
  }

  res.status(201).json({ invite: { id: invite.id, email: invite.email, expiresAt: invite.expiresAt }, link });
});

businessRouter.delete("/invites/:id", requireOwner, async (req, res) => {
  const deleted = await prisma.businessInvite.deleteMany({
    where: { id: req.params.id, businessId: req.auth!.businessId },
  });
  if (deleted.count === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ok: true });
});
