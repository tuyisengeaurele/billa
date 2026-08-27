import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (req, res) => {
  const userId = req.auth!.userId;

  const [results, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  res.json({ results, unreadCount });
});

notificationsRouter.post("/:id/read", async (req, res) => {
  const { id } = req.params;

  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== req.auth!.userId) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

notificationsRouter.post("/mark-all-read", async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.auth!.userId, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
});
