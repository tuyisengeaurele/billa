import * as Sentry from "@sentry/node";
import { isOverdueAt, startOfUtcDay } from "@billa/shared";
import { prisma } from "./prisma.js";
import { buildPdfRenderData } from "./pdf/render-data.js";
import { renderDocumentPdf } from "./pdf/render-document-pdf.js";
import { sendDocumentEmail } from "./mailer.js";
import { buildDueSoonReminderEmail } from "./email-templates.js";
import { buildPublicAssetUrl } from "./asset-url.js";
import { withSchedule } from "./document-schedule.js";
import { getInvoiceOutstandingBalance } from "./invoice-payment-status.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SentDueSoonReminder {
  documentId: string;
  sentTo: string;
}

function sameDay(a: Date, b: Date | null): boolean {
  return b !== null && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/**
 * Sends one friendly note per payment, a few days before it falls due: the invoice's due date, or the
 * next unpaid instalment of a payment plan. Late payments are left to the overdue reminders.
 */
export async function sendDueSoonReminders(businessId: string): Promise<SentDueSoonReminder[]> {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business || !business.remindersEnabled || business.dueSoonReminderDays <= 0) return [];

  const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  const businessLogoUrl = buildPublicAssetUrl(business.logoUrl);

  const now = new Date();
  // A payment due today is still on time, so it can still get its note.
  const today = startOfUtcDay(now);
  const horizon = new Date(now.getTime() + business.dueSoonReminderDays * DAY_MS);

  const candidates = await prisma.document.findMany({
    where: {
      businessId,
      type: "INVOICE",
      status: "FINALIZED",
      remindersEnabled: true,
      customer: { email: { not: null } },
      AND: [
        // Coming due as a whole, or (on a payment plan) on one of its steps.
        {
          OR: [
            { dueDate: { gte: today, lte: horizon } },
            { installments: { some: { dueDate: { gte: today, lte: horizon } } } },
          ],
        },
        { OR: [{ paymentStatus: null }, { paymentStatus: { notIn: ["PAID", "WRITTEN_OFF"] } }] },
      ],
    },
    include: { lines: { orderBy: { sortOrder: "asc" } }, customer: true, installments: { orderBy: { sortOrder: "asc" } } },
  });

  const sent: SentDueSoonReminder[] = [];

  for (const doc of candidates) {
    const email = doc.customer.email;
    if (!email) continue;

    const { nextInstallment } = await withSchedule(doc, now);
    const isInstallment = doc.installments.length > 0;
    // The payment that is coming up next: the next unpaid instalment, or the invoice's own due date.
    const nextDue = isInstallment ? (nextInstallment ? new Date(nextInstallment.dueDate) : null) : doc.dueDate;
    if (!nextDue || isOverdueAt(nextDue, now) || nextDue > horizon) continue;
    if (sameDay(nextDue, doc.dueSoonReminderFor)) continue;

    const balance = await getInvoiceOutstandingBalance(doc.id);
    if (!balance || balance.amountOwed <= 0) continue;
    const amount = nextInstallment ? Math.min(nextInstallment.remaining, balance.amountOwed) : balance.amountOwed;

    const data = await buildPdfRenderData(doc, business);
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderDocumentPdf(doc.template, data);
    } catch (err) {
      Sentry.captureException(err);
      continue;
    }

    const { subject, html } = buildDueSoonReminderEmail({
      language: doc.language,
      customerName: doc.customer.name,
      number: doc.number,
      businessName: business.name,
      dueDate: nextDue.toISOString().slice(0, 10),
      amount,
      currency: doc.currency,
      isInstallment,
      installmentLabel: nextInstallment?.label ?? null,
      businessAddress: business.address,
      businessPhone: business.phone,
      businessEmail: business.email,
      businessLogoUrl,
      viewUrl: `${clientOrigin}/view/${doc.publicToken}`,
      payable: business.momoEnabled && doc.currency === "RWF",
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

    await prisma.document.update({ where: { id: doc.id }, data: { dueSoonReminderFor: nextDue } });
    sent.push({ documentId: doc.id, sentTo: email });
  }

  return sent;
}
