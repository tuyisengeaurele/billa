import type { NotificationType } from "@prisma/client";
import { prisma } from "./prisma.js";

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  await prisma.notification.create({ data: input });
}

export async function notifyAdmins(input: Omit<CreateNotificationInput, "userId">): Promise<void> {
  const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
  if (admins.length === 0) return;

  await prisma.notification.createMany({
    data: admins.map((admin) => ({ ...input, userId: admin.id })),
  });
}
