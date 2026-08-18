import { Router } from "express";
import type { DocumentType as PrismaDocumentType } from "@prisma/client";
import { businessProfileSchema, updateSequencesSchema } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate.js";
import { mergeSequences } from "../lib/document-sequences.js";

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

businessRouter.get("/sequences", async (req, res) => {
  const saved = await prisma.documentSequence.findMany({ where: { businessId: req.auth!.businessId } });
  res.json({ sequences: mergeSequences(saved) });
});

businessRouter.patch("/", validateBody(businessProfileSchema), async (req, res) => {
  const business = await prisma.business.update({
    where: { id: req.auth!.businessId },
    data: req.body,
  });
  res.json({ business });
});

businessRouter.put("/sequences", validateBody(updateSequencesSchema), async (req, res) => {
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
