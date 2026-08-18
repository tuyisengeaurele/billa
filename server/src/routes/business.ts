import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";

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
