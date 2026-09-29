import type { Prisma } from "@prisma/client";

type TransactionClient = Prisma.TransactionClient;

export async function deleteBusinessCascade(tx: TransactionClient, businessId: string): Promise<void> {
  // Payments point at both a document and a MoMo request, so they go first, then the
  // requests, before the documents they were made for.
  await tx.invoicePayment.deleteMany({ where: { businessId } });
  await tx.momoPaymentRequest.deleteMany({ where: { businessId } });
  await tx.impersonationRequest.deleteMany({ where: { businessId } });
  await tx.apiKey.deleteMany({ where: { businessId } });
  await tx.documentLine.deleteMany({ where: { document: { businessId } } });
  await tx.document.deleteMany({ where: { businessId } });
  await tx.documentSequence.deleteMany({ where: { businessId } });
  await tx.item.deleteMany({ where: { businessId } });
  await tx.customer.deleteMany({ where: { businessId } });
  await tx.businessMember.deleteMany({ where: { businessId } });
  await tx.businessInvite.deleteMany({ where: { businessId } });
  await tx.activityLogEntry.deleteMany({ where: { businessId } });
  await tx.business.delete({ where: { id: businessId } });
}

export async function deleteUserCascade(tx: TransactionClient, userId: string): Promise<void> {
  const ownedBusinesses = await tx.business.findMany({ where: { ownerId: userId }, select: { id: true } });
  for (const business of ownedBusinesses) {
    await deleteBusinessCascade(tx, business.id);
  }
  // A payment a team member recorded in someone else's business is that business's financial
  // record, so it stays and is credited to the owner instead of being deleted with the member.
  const paymentsByMember = await tx.invoicePayment.findMany({
    where: { createdByUserId: userId },
    select: { businessId: true },
    distinct: ["businessId"],
  });
  for (const { businessId } of paymentsByMember) {
    const business = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { ownerId: true } });
    await tx.invoicePayment.updateMany({
      where: { businessId, createdByUserId: userId },
      data: { createdByUserId: business.ownerId },
    });
  }
  await tx.notification.deleteMany({ where: { userId } });
  await tx.impersonationRequest.deleteMany({ where: { OR: [{ requesterId: userId }, { targetUserId: userId }] } });
  await tx.businessMember.deleteMany({ where: { userId } });
  await tx.activityLogEntry.deleteMany({ where: { actorUserId: userId } });
  await tx.refreshToken.deleteMany({ where: { userId } });
  await tx.twoFactorChallenge.deleteMany({ where: { userId } });
  await tx.payment.deleteMany({ where: { userId } });
  await tx.user.delete({ where: { id: userId } });
}
