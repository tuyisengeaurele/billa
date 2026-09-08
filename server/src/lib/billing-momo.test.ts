import { beforeEach, describe, expect, it } from "vitest";
import { getBillingMomoConfig } from "./billing-momo.js";
import { MOMO_BASE_URLS } from "./momo-client.js";

const ALL_VARS = [
  "MOMO_BILLING_SUBSCRIPTION_KEY",
  "MOMO_BILLING_API_USER",
  "MOMO_BILLING_API_KEY",
  "MOMO_BILLING_ENVIRONMENT",
  "MOMO_BILLING_TARGET_ENVIRONMENT",
];

function setSandboxEnv() {
  process.env.MOMO_BILLING_SUBSCRIPTION_KEY = "sub-key";
  process.env.MOMO_BILLING_API_USER = "api-user";
  process.env.MOMO_BILLING_API_KEY = "api-key";
  process.env.MOMO_BILLING_ENVIRONMENT = "sandbox";
}

describe("getBillingMomoConfig", () => {
  beforeEach(() => {
    for (const key of ALL_VARS) delete process.env[key];
  });

  it("builds sandbox credentials with EUR and the sandbox base URL", () => {
    setSandboxEnv();

    const { credentials, currency } = getBillingMomoConfig();

    expect(currency).toBe("EUR");
    expect(credentials).toEqual({
      subscriptionKey: "sub-key",
      apiUser: "api-user",
      apiKey: "api-key",
      targetEnvironment: "sandbox",
      baseUrl: MOMO_BASE_URLS.sandbox,
    });
  });

  it("builds production credentials with RWF, the production base URL, and the configured target environment", () => {
    setSandboxEnv();
    process.env.MOMO_BILLING_ENVIRONMENT = "production";
    process.env.MOMO_BILLING_TARGET_ENVIRONMENT = "live-target";

    const { credentials, currency } = getBillingMomoConfig();

    expect(currency).toBe("RWF");
    expect(credentials.targetEnvironment).toBe("live-target");
    expect(credentials.baseUrl).toBe(MOMO_BASE_URLS.production);
  });

  it("throws when a required credential is missing", () => {
    setSandboxEnv();
    delete process.env.MOMO_BILLING_SUBSCRIPTION_KEY;

    expect(() => getBillingMomoConfig()).toThrow("MOMO_BILLING_SUBSCRIPTION_KEY is not set");
  });

  it("throws in production when the target environment isn't set", () => {
    setSandboxEnv();
    process.env.MOMO_BILLING_ENVIRONMENT = "production";

    expect(() => getBillingMomoConfig()).toThrow("MOMO_BILLING_TARGET_ENVIRONMENT is not set");
  });
});
