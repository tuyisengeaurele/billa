import type { MomoCredentials } from "./momo-client.js";
import { MOMO_BASE_URLS } from "./momo-client.js";
import { requireEnv } from "./require-env.js";

export function getBillingMomoConfig(): { credentials: MomoCredentials; currency: string } {
  const environment = requireEnv("MOMO_BILLING_ENVIRONMENT") as "sandbox" | "production";
  const targetEnvironment = environment === "sandbox" ? "sandbox" : requireEnv("MOMO_BILLING_TARGET_ENVIRONMENT");

  const credentials: MomoCredentials = {
    subscriptionKey: requireEnv("MOMO_BILLING_SUBSCRIPTION_KEY"),
    apiUser: requireEnv("MOMO_BILLING_API_USER"),
    apiKey: requireEnv("MOMO_BILLING_API_KEY"),
    targetEnvironment,
    baseUrl: MOMO_BASE_URLS[environment],
  };
  const currency = environment === "sandbox" ? "EUR" : "RWF";

  return { credentials, currency };
}
