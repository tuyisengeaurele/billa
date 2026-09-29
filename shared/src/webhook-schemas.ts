import { z } from "zod";

export const WEBHOOK_EVENTS = ["document.finalized", "payment.received"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "document.finalized": "A document is finalized",
  "payment.received": "A payment is recorded",
};

export const MAX_WEBHOOK_ENDPOINTS = 5;

export const createWebhookSchema = z.object({
  url: z.string().trim().min(1, "Enter the URL to send events to").max(500, "That URL is too long"),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Choose at least one event"),
});
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
