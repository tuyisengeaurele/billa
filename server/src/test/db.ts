import { prisma } from "../lib/prisma.js";

export async function resetDb() {
  await prisma.contactMessage.deleteMany();
  await prisma.documentLine.deleteMany();
  await prisma.document.deleteMany();
  await prisma.documentSequence.deleteMany();
  await prisma.item.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.twoFactorChallenge.deleteMany();
  await prisma.businessMember.deleteMany();
  await prisma.businessInvite.deleteMany();
  await prisma.activityLogEntry.deleteMany();
  await prisma.adminAuditLogEntry.deleteMany();
  await prisma.jobRunLog.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.business.deleteMany();
  await prisma.user.deleteMany();
}
