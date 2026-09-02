import * as Sentry from "@sentry/node";
import { prisma } from "./prisma.js";
import { buildPdfRenderData } from "./pdf/render-data.js";
import { renderDocumentPdf } from "./pdf/render-document-pdf.js";
import { sendDocumentEmail } from "./mailer.js";
import { createNotification } from "./notifications.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SentReminder {
  documentId: string;
  sentTo: string;
}

export async function sendOverdueReminders(businessId: string): Promise<SentReminder[]> {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business || !business.remindersEnabled) return [];

  const now = new Date();
  const cooldownCutoff = new Date(now.getTime() - business.reminderCadenceDays * DAY_MS);

  const overdue = await prisma.document.findMany({
    where: {
      businessId,
      type: "INVOICE",
      status: "FINALIZED",
      dueDate: { lt: now },
      customer: { email: { not: null } },
      AND: [
        { OR: [{ lastReminderSentAt: null }, { lastReminderSentAt: { lt: cooldownCutoff } }] },
        // paymentStatus can be null for an invoice that hasn't had its status computed yet;
        // notIn alone would silently exclude those rows (NULL NOT IN (...) is NULL, not true).
        { OR: [{ paymentStatus: null }, { paymentStatus: { notIn: ["PAID", "WRITTEN_OFF"] } }] },
      ],
    },
    include: { lines: { orderBy: { sortOrder: "asc" } }, customer: true },
  });

  const sent: SentReminder[] = [];

  for (const doc of overdue) {
    const email = doc.customer.email;
    if (!email) continue;

    const data = await buildPdfRenderData(doc, business);
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderDocumentPdf(doc.template, data);
    } catch (err) {
      Sentry.captureException(err);
      continue;
    }

    try {
      await sendDocumentEmail({
        to: email,
        subject: `Reminder: ${doc.number} is overdue`,
        html: `<p>Hello ${doc.customer.name},</p><p>This is a reminder that invoice ${doc.number} from ${business.name} was due on ${doc.dueDate!.toISOString().slice(0, 10)} and is still outstanding.</p>`,
        attachmentFilename: `${doc.number}.pdf`,
        attachmentBuffer: pdfBuffer,
      });
    } catch (err) {
      Sentry.captureException(err);
      continue;
    }

    await prisma.document.update({ where: { id: doc.id }, data: { lastReminderSentAt: now } });

    await createNotification({
      userId: business.ownerId,
      type: "INVOICE_OVERDUE",
      title: `${doc.number} is overdue`,
      body: `${doc.customer.name} hasn't paid ${doc.number} yet.`,
      link: `/documents/${doc.id}`,
    });

    sent.push({ documentId: doc.id, sentTo: email });
  }

  return sent;
}
