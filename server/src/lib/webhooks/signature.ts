import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 5 * 60;

function hmac(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** The `Billa-Signature` header: the time, and an HMAC over "time.body" so a captured request cannot be replayed later. */
export function signWebhookPayload(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${hmac(secret, timestamp, body)}`;
}

/** What a receiver runs, kept here so the docs and the tests share one definition. */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header);
  if (!match) return false;
  const timestamp = Number(match[1]);
  if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(hmac(secret, timestamp, body), "hex");
  const actual = Buffer.from(match[2]!, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
