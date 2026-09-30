import { formatRwf, startOfUtcDay, toRwf, type Currency } from "@billa/shared";
import { prisma } from "./prisma.js";
import { sendEmail } from "./mailer.js";
import { buildOwnerDigestEmail } from "./email-templates.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface DigestResult {
  sent: boolean;
}

export async function sendOwnerPaymentDigestIfDue(businessId: string): Promise<DigestResult> {
  const business = await prisma.business.findUnique({ where: { id: businessId }, include: { owner: true } });
  if (!business) return { sent: false };

  const now = new Date();
  const weekAgo = new Date(now.getTime() - WEEK_MS);

  if (business.lastDigestSentAt && business.lastDigestSentAt > weekAgo) {
    return { sent: false };
  }

  const [collectedPayments, newlyOverdueCount] = await Promise.all([
    prisma.invoicePayment.findMany({
      where: { businessId, voidedAt: null, paidOn: { gte: weekAgo } },
      select: { amount: true, document: { select: { currency: true, exchangeRate: true } } },
    }),
    prisma.document.count({
      where: {
        businessId,
        type: "INVOICE",
        status: "FINALIZED",
        paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] },
        // Overdue starts the day after the due date, so a due date today is not late yet.
        dueDate: { gte: startOfUtcDay(weekAgo), lt: startOfUtcDay(now) },
      },
    }),
  ]);

  const totalCollected = collectedPayments.reduce(
    (sum, payment) => sum + toRwf(payment.amount, payment.document.currency as Currency, payment.document.exchangeRate),
    0,
  );

  const { subject, html } = buildOwnerDigestEmail({
    businessName: business.name,
    totalCollectedFormatted: formatRwf(totalCollected),
    newlyOverdueCount,
  });

  await sendEmail({ to: business.owner.email, subject, html });

  await prisma.business.update({ where: { id: businessId }, data: { lastDigestSentAt: now } });

  return { sent: true };
}
