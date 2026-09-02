import { formatRwf } from "@billa/shared";
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
      select: { amount: true },
    }),
    prisma.document.count({
      where: {
        businessId,
        type: "INVOICE",
        status: "FINALIZED",
        paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] },
        dueDate: { gte: weekAgo, lt: now },
      },
    }),
  ]);

  const totalCollected = collectedPayments.reduce((sum, payment) => sum + payment.amount, 0);

  const { subject, html } = buildOwnerDigestEmail({
    businessName: business.name,
    totalCollectedFormatted: formatRwf(totalCollected),
    newlyOverdueCount,
  });

  await sendEmail({ to: business.owner.email, subject, html });

  await prisma.business.update({ where: { id: businessId }, data: { lastDigestSentAt: now } });

  return { sent: true };
}
