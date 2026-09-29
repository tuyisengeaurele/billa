import { describe, expect, it } from "vitest";
import { createWebhookSchema, WEBHOOK_EVENTS } from "./webhook-schemas.js";

describe("createWebhookSchema", () => {
  it("accepts a url and known events", () => {
    const parsed = createWebhookSchema.parse({ url: " https://example.com/hook ", events: ["payment.received"] });
    expect(parsed).toEqual({ url: "https://example.com/hook", events: ["payment.received"] });
  });

  it("rejects no events, an unknown event and a blank url", () => {
    expect(createWebhookSchema.safeParse({ url: "https://example.com", events: [] }).success).toBe(false);
    expect(createWebhookSchema.safeParse({ url: "https://example.com", events: ["invoice.deleted"] }).success).toBe(false);
    expect(createWebhookSchema.safeParse({ url: "  ", events: ["payment.received"] }).success).toBe(false);
  });

  it("lists the events a webhook can subscribe to", () => {
    expect(WEBHOOK_EVENTS).toEqual(["document.finalized", "payment.received"]);
  });
});
