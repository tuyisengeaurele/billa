import { describe, expect, it } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "./signature.js";

describe("signWebhookPayload", () => {
  it("makes a header carrying the timestamp and an HMAC of timestamp.body", () => {
    const header = signWebhookPayload("whsec_abc", '{"a":1}', 1_700_000_000);
    expect(header).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
  });

  it("changes when the body, secret or time changes", () => {
    const base = signWebhookPayload("whsec_abc", '{"a":1}', 1_700_000_000);
    expect(signWebhookPayload("whsec_abc", '{"a":2}', 1_700_000_000)).not.toBe(base);
    expect(signWebhookPayload("whsec_xyz", '{"a":1}', 1_700_000_000)).not.toBe(base);
    expect(signWebhookPayload("whsec_abc", '{"a":1}', 1_700_000_001)).not.toBe(base);
  });
});

describe("verifyWebhookSignature", () => {
  const now = 1_700_000_100;

  it("accepts a fresh, correctly signed body", () => {
    const header = signWebhookPayload("whsec_abc", "body", 1_700_000_000);
    expect(verifyWebhookSignature("whsec_abc", "body", header, now)).toBe(true);
  });

  it("rejects a tampered body or the wrong secret", () => {
    const header = signWebhookPayload("whsec_abc", "body", 1_700_000_000);
    expect(verifyWebhookSignature("whsec_abc", "other", header, now)).toBe(false);
    expect(verifyWebhookSignature("whsec_zzz", "body", header, now)).toBe(false);
  });

  it("rejects a signature older than the tolerance, to stop replays", () => {
    const header = signWebhookPayload("whsec_abc", "body", 1_700_000_000);
    expect(verifyWebhookSignature("whsec_abc", "body", header, 1_700_000_000 + 10 * 60)).toBe(false);
  });

  it("rejects a malformed header", () => {
    expect(verifyWebhookSignature("whsec_abc", "body", "garbage", now)).toBe(false);
    expect(verifyWebhookSignature("whsec_abc", "body", "", now)).toBe(false);
  });
});
