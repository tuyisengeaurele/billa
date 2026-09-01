import { Router } from "express";
import * as Sentry from "@sentry/node";
import { contactListQuerySchema, contactMessageSchema } from "@billa/shared";
import type { ContactListQuery } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { validateBody } from "../middleware/validate.js";
import { validateQuery } from "../middleware/validate-query.js";
import { contactRateLimit } from "../middleware/contact-rate-limit.js";
import { sendEmail } from "../lib/resend.js";
import { notifyAdmins } from "../lib/notifications.js";

export const contactRouter = Router();

contactRouter.post("/", contactRateLimit, validateBody(contactMessageSchema), async (req, res) => {
  const { name, email, message } = req.body as { name: string; email: string; message: string };

  await prisma.contactMessage.create({ data: { name, email, message } });

  await notifyAdmins({
    type: "CONTACT_MESSAGE_RECEIVED",
    title: `New message from ${name}`,
    body: message.slice(0, 140),
    link: "/admin/messages",
  });

  const notifyTo = process.env.CONTACT_NOTIFICATION_EMAIL;
  if (notifyTo) {
    try {
      await sendEmail({
        to: notifyTo,
        subject: `New contact message from ${name}`,
        html: `<p>From: ${name} (${email})</p><p>${message}</p>`,
      });
    } catch (err) {
      // The message is already stored; a failed notification shouldn't fail the request.
      Sentry.captureException(err);
    }
  }

  res.status(201).json({ ok: true });
});

contactRouter.get(
  "/",
  requireAuth,
  requireAdmin,
  validateQuery(contactListQuerySchema),
  async (req, res) => {
    const query = req.listQuery as ContactListQuery;

    const where = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { email: { contains: query.search, mode: "insensitive" as const } },
            { message: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [results, total] = await Promise.all([
      prisma.contactMessage.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.contactMessage.count({ where }),
    ]);

    res.json({ results, total, page: query.page, pageSize: query.pageSize });
  },
);

contactRouter.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;

  const message = await prisma.contactMessage.findUnique({ where: { id } });
  if (!message) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  await prisma.contactMessage.delete({ where: { id } });

  res.json({ ok: true });
});
