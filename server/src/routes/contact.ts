import { Router } from "express";
import { contactMessageSchema } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { validateBody } from "../middleware/validate.js";

export const contactRouter = Router();

contactRouter.post("/", validateBody(contactMessageSchema), async (req, res) => {
  const { name, email, message } = req.body as { name: string; email: string; message: string };

  await prisma.contactMessage.create({ data: { name, email, message } });

  res.status(201).json({ ok: true });
});
