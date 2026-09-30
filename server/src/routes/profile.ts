import { Router } from "express";
import multer from "multer";
import { NOTIFICATION_TYPES, updateNotificationPreferencesSchema, updateProfileSchema } from "@billa/shared";
import type { UpdateNotificationPreferencesInput, UpdateProfileInput } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { generalApiRateLimit } from "../middleware/general-rate-limit.js";
import { validateBody } from "../middleware/validate.js";
import { detectAllowedImageType } from "../lib/file-sniff.js";
import { getStorage } from "../lib/storage.js";
import { UNKNOWN_DEVICE } from "../lib/device-name.js";
import { requestDeviceId } from "../lib/session.js";

export const profileRouter = Router();

profileRouter.use(requireAuth);
profileRouter.use(generalApiRateLimit);

const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("avatar");

function withDefaults(stored: unknown): Record<string, boolean> {
  const preferences = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const result: Record<string, boolean> = {};
  for (const type of NOTIFICATION_TYPES) {
    result[type] = preferences[type] !== false;
  }
  return result;
}

profileRouter.patch("/", validateBody(updateProfileSchema), async (req, res) => {
  const body = req.body as UpdateProfileInput;
  const user = await prisma.user.update({
    where: { id: req.auth!.userId },
    data: { name: body.name, ...(body.phone !== undefined ? { phone: body.phone } : {}) },
  });
  res.json({
    user: { id: user.id, name: user.name, phone: user.phone, email: user.email, avatarUrl: user.avatarUrl },
  });
});

profileRouter.post(
  "/avatar",
  (req, res, next) => {
    uploadAvatar(req, res, (err) => {
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

    const { url } = await getStorage().save(req.file.buffer, req.auth!.userId, detected.ext);
    await prisma.user.update({ where: { id: req.auth!.userId }, data: { avatarUrl: url } });
    res.status(201).json({ url });
  },
);

profileRouter.post("/tour-seen", async (req, res) => {
  await prisma.user.update({
    where: { id: req.auth!.userId },
    data: { productTourSeenAt: new Date() },
  });
  res.json({ ok: true });
});

profileRouter.delete("/avatar", async (req, res) => {
  await prisma.user.update({ where: { id: req.auth!.userId }, data: { avatarUrl: null } });
  res.json({ ok: true });
});

profileRouter.get("/sessions", async (req, res) => {
  // The refresh cookie never reaches this route (it is only sent to /auth/refresh), so "this device" is
  // found through the device cookie, which is sent everywhere.
  const currentDeviceId = requestDeviceId(req);

  const sessions = await prisma.refreshToken.findMany({
    where: { userId: req.auth!.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, createdAt: true, expiresAt: true, deviceId: true, deviceName: true, lastUsedAt: true },
    orderBy: { lastUsedAt: "desc" },
  });

  res.json({
    results: sessions.map((session) => ({
      id: session.id,
      deviceName: session.deviceName ?? UNKNOWN_DEVICE,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      isCurrent: currentDeviceId !== null && session.deviceId === currentDeviceId,
    })),
  });
});

profileRouter.post("/sessions/:id/revoke", async (req, res) => {
  const { id } = req.params;

  const session = await prisma.refreshToken.findUnique({ where: { id } });
  if (!session || session.userId !== req.auth!.userId) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  await prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
  res.json({ ok: true });
});

profileRouter.post("/sessions/revoke-others", async (req, res) => {
  const currentDeviceId = requestDeviceId(req);
  // With no device cookie there is no telling which session is this one, so nothing is ended rather than
  // signing the caller out along with the rest.
  if (!currentDeviceId) {
    res.json({ ok: true });
    return;
  }

  await prisma.refreshToken.updateMany({
    where: {
      userId: req.auth!.userId,
      revokedAt: null,
      // Every other device, never this one. A null deviceId would be skipped by "not", so it is named.
      OR: [{ deviceId: { not: currentDeviceId } }, { deviceId: null }],
    },
    data: { revokedAt: new Date() },
  });

  res.json({ ok: true });
});

profileRouter.get("/notification-preferences", async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.auth!.userId },
    select: { notificationPreferences: true },
  });
  res.json({ preferences: withDefaults(user.notificationPreferences) });
});

profileRouter.patch(
  "/notification-preferences",
  validateBody(updateNotificationPreferencesSchema),
  async (req, res) => {
    const body = req.body as UpdateNotificationPreferencesInput;
    const existing = await prisma.user.findUniqueOrThrow({
      where: { id: req.auth!.userId },
      select: { notificationPreferences: true },
    });

    const merged = { ...withDefaults(existing.notificationPreferences), ...body.preferences };
    await prisma.user.update({
      where: { id: req.auth!.userId },
      data: { notificationPreferences: merged },
    });

    res.json({ preferences: merged });
  },
);
