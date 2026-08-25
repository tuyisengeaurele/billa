import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";

export const announcementsRouter = Router();

announcementsRouter.use(requireAuth);

announcementsRouter.get("/active", async (_req, res) => {
  const announcement = await prisma.announcement.findFirst({
    where: { active: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ announcement });
});
