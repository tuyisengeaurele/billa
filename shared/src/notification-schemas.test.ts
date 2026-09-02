import { describe, expect, it } from "vitest";
import { updateNotificationPreferencesSchema } from "./notification-schemas.js";

describe("updateNotificationPreferencesSchema", () => {
  it("accepts a partial set of preferences", () => {
    const result = updateNotificationPreferencesSchema.safeParse({ preferences: { PAYMENT_RECEIVED: false } });
    expect(result.success).toBe(true);
  });

  it("accepts an empty preferences object", () => {
    expect(updateNotificationPreferencesSchema.safeParse({ preferences: {} }).success).toBe(true);
  });

  it("rejects a missing preferences key", () => {
    expect(updateNotificationPreferencesSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an unknown notification type", () => {
    expect(
      updateNotificationPreferencesSchema.safeParse({ preferences: { NOT_A_REAL_TYPE: false } }).success,
    ).toBe(false);
  });
});
