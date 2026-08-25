import { prisma } from "./prisma.js";

export async function hasBusinessAccess(userId: string, businessId: string): Promise<boolean> {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return false;
  if (business.ownerId === userId) return true;
  const membership = await prisma.businessMember.findUnique({
    where: { businessId_userId: { businessId, userId } },
  });
  return !!membership;
}
