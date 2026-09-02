import { z } from "zod";

export const NOTIFICATION_TYPES = [
  "INVOICE_OVERDUE",
  "PAYMENT_RECEIVED",
  "MEMBER_JOINED",
  "CONTACT_MESSAGE_RECEIVED",
  "DOCUMENT_ACCEPTED",
  "DOCUMENT_DECLINED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const updateNotificationPreferencesSchema = z.object({
  preferences: z
    .object({
      INVOICE_OVERDUE: z.boolean().optional(),
      PAYMENT_RECEIVED: z.boolean().optional(),
      MEMBER_JOINED: z.boolean().optional(),
      CONTACT_MESSAGE_RECEIVED: z.boolean().optional(),
      DOCUMENT_ACCEPTED: z.boolean().optional(),
      DOCUMENT_DECLINED: z.boolean().optional(),
    })
    .strict(),
});
export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesSchema>;
