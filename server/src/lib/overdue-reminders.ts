import * as Sentry from "@sentry/node";
import { prisma } from "./prisma.js";
import { buildPdfRenderData } from "./pdf/render-data.js";
import { renderDocumentPdf } from "./pdf/render-document-pdf.js";
import { sendDocumentEmail } from "./mailer.js";
import { buildOverdueReminderEmail } from "./email-templates.js";
import { buildPublicAssetUrl } from "./asset-url.js";
import { createNotification } from "./notifications.js";
import { withSchedule } from "./document-schedule.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SentReminder {
  documentId: string;
  sentTo: string;
}

export async function sendOverdueReminders(businessId: string): Promise<SentReminder[]> {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business || !business.remindersEnabled) return [];

  const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  const businessLogoUrl = buildPublicAssetUrl(business.logoUrl);

  const now = new Date();
  const cooldownCutoff = new Date(now.getTime() - business.reminderCadenceDays * DAY_MS);

  const overdue = await prisma.document.findMany({
    where: {
      businessId,
      type: "INVOICE",
      status: "FINALIZED",
      remindersEnabled: true,
      customer: { email: { not: null } },
      AND: [
        // Late as a whole, or (for an invoice paid in instalments) late on one of its steps.
        { OR: [{ dueDate: { lt: now } }, { installments: { some: { dueDate: { lt: now } } } }] },
        { OR: [{ lastReminderSentAt: null }, { lastReminderSentAt: { lt: cooldownCutoff } }] },
        // paymentStatus can be null for an invoice that hasn't had its status computed yet;
        // notIn alone would silently exclude those rows (NULL NOT IN (...) is NULL, not true).
        { OR: [{ paymentStatus: null }, { paymentStatus: { notIn: ["PAID", "WRITTEN_OFF"] } }] },
      ],
    },
    include: { lines: { orderBy: { sortOrder: "asc" } }, customer: true, installments: { orderBy: { sortOrder: "asc" } } },
  });

  const sent: SentReminder[] = [];

  for (const doc of overdue) {
    const email = doc.customer.email;
    if (!email) continue;

    // With a plan, only the next unpaid instalment matters: if it is not late yet, nothing is overdue.
    const { nextInstallment } = await withSchedule(doc, now);
    if (doc.installments.length > 0 && !nextInstallment?.isOverdue) continue;

    const data = await buildPdfRenderData(doc, business);
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderDocumentPdf(doc.template, data);
    } catch (err) {
      Sentry.captureException(err);
      continue;
    }

    const { subject, html } = buildOverdueReminderEmail({
      language: doc.language,
      customerName: doc.customer.name,
      number: doc.number,
      businessName: business.name,
      dueDate: nextInstallment ? nextInstallment.dueDate.slice(0, 10) : doc.dueDate!.toISOString().slice(0, 10),
      installment: nextInstallment ? { label: nextInstallment.label, amount: nextInstallment.remaining } : undefined,
      currency: doc.currency,
      businessAddress: business.address,
      businessPhone: business.phone,
      businessEmail: business.email,
      businessLogoUrl,
      viewUrl: `${clientOrigin}/view/${doc.publicToken}`,
      payable: business.momoEnabled,
    });

    try {
      await sendDocumentEmail({
        to: email,
        subject,
        html,
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
