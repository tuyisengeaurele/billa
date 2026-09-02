import * as Sentry from "@sentry/node";
import { prisma } from "./prisma.js";
import { buildPdfRenderData } from "./pdf/render-data.js";
import { renderDocumentPdf } from "./pdf/render-document-pdf.js";
import { sendDocumentEmail } from "./mailer.js";
import { buildQuoteExpiryReminderEmail } from "./email-templates.js";
import { buildPublicAssetUrl } from "./asset-url.js";
import { getPdfLabels } from "@billa/shared";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_WINDOW_DAYS = 3;

export interface SentExpiryReminder {
  documentId: string;
  sentTo: string;
}

export async function sendQuoteExpiryReminders(businessId: string): Promise<SentExpiryReminder[]> {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business || !business.remindersEnabled) return [];

  const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  const businessLogoUrl = buildPublicAssetUrl(business.logoUrl);

  const now = new Date();
  const expiryCutoff = new Date(now.getTime() + EXPIRY_WINDOW_DAYS * DAY_MS);

  const expiring = await prisma.document.findMany({
    where: {
      businessId,
      type: { in: ["QUOTE", "PROFORMA"] },
      status: "FINALIZED",
      dueDate: { not: null, lte: expiryCutoff },
      declinedAt: null,
      expiryReminderSentAt: null,
      remindersEnabled: true,
      customer: { email: { not: null } },
      convertedTo: { is: null },
    },
    include: { lines: { orderBy: { sortOrder: "asc" } }, customer: true },
  });

  const sent: SentExpiryReminder[] = [];

  for (const doc of expiring) {
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

    const typeLabel = getPdfLabels(doc.language).typeLabels[doc.type];
    const { subject, html } = buildQuoteExpiryReminderEmail({
      language: doc.language,
      customerName: doc.customer.name,
      typeLabel,
      number: doc.number,
      businessName: business.name,
      expiryDate: doc.dueDate!.toISOString().slice(0, 10),
      businessAddress: business.address,
      businessPhone: business.phone,
      businessEmail: business.email,
      businessLogoUrl,
      viewUrl: `${clientOrigin}/view/${doc.publicToken}`,
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

    await prisma.document.update({ where: { id: doc.id }, data: { expiryReminderSentAt: now } });

    sent.push({ documentId: doc.id, sentTo: email });
  }

  return sent;
}
