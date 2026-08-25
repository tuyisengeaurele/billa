import type { ActivityAction, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export interface LogActivityInput {
  businessId: string;
  actorUserId: string;
  action: ActivityAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export async function logActivity(input: LogActivityInput): Promise<void> {
  await prisma.activityLogEntry.create({
    data: {
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
