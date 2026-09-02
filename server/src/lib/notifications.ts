import type { NotificationType } from "@prisma/client";
import { prisma } from "./prisma.js";

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

function isEnabled(preferences: unknown, type: NotificationType): boolean {
  if (!preferences || typeof preferences !== "object") return true;
  const value = (preferences as Record<string, unknown>)[type];
  return value !== false;
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { notificationPreferences: true },
  });
  if (user && !isEnabled(user.notificationPreferences, input.type)) return;

  await prisma.notification.create({ data: input });
}

export async function notifyAdmins(input: Omit<CreateNotificationInput, "userId">): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { isAdmin: true },
    select: { id: true, notificationPreferences: true },
  });
  const recipients = admins.filter((admin) => isEnabled(admin.notificationPreferences, input.type));
  if (recipients.length === 0) return;

  await prisma.notification.createMany({
    data: recipients.map((admin) => ({ ...input, userId: admin.id })),
  });
}
