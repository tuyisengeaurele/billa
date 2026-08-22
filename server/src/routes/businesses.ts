import { Router } from "express";
import { BUSINESS_LIMIT, createBusinessSchema } from "@billa/shared";
import type { CreateBusinessInput } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate.js";
import { issueSession } from "../lib/session.js";

export const businessesRouter = Router();

businessesRouter.use(requireAuth);

businessesRouter.get("/", async (req, res) => {
  const businesses = await prisma.business.findMany({
    where: { ownerId: req.auth!.userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  res.json({ businesses });
});

businessesRouter.post("/", validateBody(createBusinessSchema), async (req, res) => {
  const { name } = req.body as CreateBusinessInput;
  const ownerId = req.auth!.userId;

  const count = await prisma.business.count({ where: { ownerId } });
  if (count >= BUSINESS_LIMIT) {
    res.status(409).json({ error: "business_limit_reached" });
    return;
  }

  const business = await prisma.business.create({ data: { name, ownerId } });
  await prisma.user.update({ where: { id: ownerId }, data: { lastActiveBusinessId: business.id } });
  await issueSession(res, ownerId, business.id);
  res.status(201).json({ business: { id: business.id, name: business.name } });
});
