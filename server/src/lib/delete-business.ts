import type { Prisma } from "@prisma/client";

type TransactionClient = Prisma.TransactionClient;

export async function deleteBusinessCascade(tx: TransactionClient, businessId: string): Promise<void> {
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
