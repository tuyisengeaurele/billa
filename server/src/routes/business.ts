import { Router } from "express";
import { businessProfileSchema } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate.js";

export const businessRouter = Router();

businessRouter.use(requireAuth);

businessRouter.get("/", async (req, res) => {
  const business = await prisma.business.findUnique({ where: { id: req.auth!.businessId } });
  if (!business) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ business });
});

businessRouter.patch("/", validateBody(businessProfileSchema), async (req, res) => {
  const business = await prisma.business.update({
    where: { id: req.auth!.businessId },
    data: req.body,
  });
  res.json({ business });
});
