import { prisma } from "./prisma.js";
import { buildPdfRenderData } from "./pdf/render-data.js";
import { renderDocumentPdf } from "./pdf/render-document-pdf.js";
import { sendDocumentEmail } from "./resend.js";

const REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export interface SentReminder {
  documentId: string;
  sentTo: string;
}

export async function sendOverdueReminders(businessId: string): Promise<SentReminder[]> {
  const now = new Date();
  const cooldownCutoff = new Date(now.getTime() - REMINDER_COOLDOWN_MS);

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

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  const sent: SentReminder[] = [];

  for (const doc of overdue) {
    const email = doc.customer.email;
    if (!email) continue;

    const data = await buildPdfRenderData(doc, business!);
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderDocumentPdf(doc.template, data);
    } catch {
      continue;
    }

    try {
      await sendDocumentEmail({
        to: email,
        subject: `Reminder: ${doc.number} is overdue`,
        html: `<p>Hello ${doc.customer.name},</p><p>This is a reminder that invoice ${doc.number} from ${business!.name} was due on ${doc.dueDate!.toISOString().slice(0, 10)} and is still outstanding.</p>`,
        attachmentFilename: `${doc.number}.pdf`,
        attachmentBuffer: pdfBuffer,
      });
    } catch {
      continue;
    }

    await prisma.document.update({ where: { id: doc.id }, data: { lastReminderSentAt: now } });
    sent.push({ documentId: doc.id, sentTo: email });
  }

  return sent;
}
