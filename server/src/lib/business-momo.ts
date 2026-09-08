import { decrypt } from "./encryption.js";
import { MOMO_BASE_URLS } from "./momo-client.js";
import type { MomoCredentials } from "./momo-client.js";

/**
 * Decrypts a business's own MTN Mobile Money merchant credentials (the ones a
 * business enters in Settings to accept payments on its invoices) into the shape
 * the MoMo client needs, or null if the business hasn't finished setting them up.
 */
export function buildMomoCredentials(business: {
  momoEnvironment: string | null;
  momoTargetEnvironment: string | null;
  momoSubscriptionKeyEnc: string | null;
  momoApiUserEnc: string | null;
  momoApiKeyEnc: string | null;
}): MomoCredentials | null {
  if (
    !business.momoEnvironment ||
    !business.momoTargetEnvironment ||
    !business.momoSubscriptionKeyEnc ||
    !business.momoApiUserEnc ||
    !business.momoApiKeyEnc
  ) {
    return null;
  }
  return {
    subscriptionKey: decrypt(business.momoSubscriptionKeyEnc),
    apiUser: decrypt(business.momoApiUserEnc),
    apiKey: decrypt(business.momoApiKeyEnc),
    targetEnvironment: business.momoTargetEnvironment,
    baseUrl: MOMO_BASE_URLS[business.momoEnvironment as "sandbox" | "production"],
  };
}
