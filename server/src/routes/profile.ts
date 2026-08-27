import { Router } from "express";
import multer from "multer";
import { updateProfileSchema } from "@billa/shared";
import type { UpdateProfileInput } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate.js";
import { detectAllowedImageType } from "../lib/file-sniff.js";
import { getStorage } from "../lib/storage.js";
import { hashRefreshToken } from "../lib/tokens.js";

export const profileRouter = Router();

profileRouter.use(requireAuth);

const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("avatar");

function currentSessionHash(req: { cookies?: Record<string, string> }): string | null {
  const presented = req.cookies?.refresh_token;
  return presented ? hashRefreshToken(presented) : null;
}

profileRouter.patch("/", validateBody(updateProfileSchema), async (req, res) => {
  const body = req.body as UpdateProfileInput;
  const user = await prisma.user.update({
    where: { id: req.auth!.userId },
    data: { name: body.name },
  });
  res.json({ user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl } });
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

profileRouter.delete("/avatar", async (req, res) => {
  await prisma.user.update({ where: { id: req.auth!.userId }, data: { avatarUrl: null } });
  res.json({ ok: true });
});

profileRouter.get("/sessions", async (req, res) => {
  const currentHash = currentSessionHash(req);

  const sessions = await prisma.refreshToken.findMany({
    where: { userId: req.auth!.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, createdAt: true, expiresAt: true, tokenHash: true },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    results: sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      isCurrent: currentHash !== null && session.tokenHash === currentHash,
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
  const currentHash = currentSessionHash(req);

  await prisma.refreshToken.updateMany({
    where: {
      userId: req.auth!.userId,
      revokedAt: null,
      ...(currentHash ? { tokenHash: { not: currentHash } } : {}),
    },
    data: { revokedAt: new Date() },
  });

  res.json({ ok: true });
});
