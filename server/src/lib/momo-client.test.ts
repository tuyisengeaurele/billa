import { afterEach, describe, expect, it, vi } from "vitest";
import { getAccessToken, getRequestToPayStatus, MOMO_BASE_URLS, requestToPay } from "./momo-client.js";

const CREDS = {
  subscriptionKey: "sub-key",
  apiUser: "api-user",
  apiKey: "api-key",
  targetEnvironment: "sandbox",
  baseUrl: MOMO_BASE_URLS.sandbox,
};

describe("momo-client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getAccessToken", () => {
    it("returns the access token from a successful response", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ access_token: "token-abc", expires_in: 3600 }), { status: 200 }),
      );

      const token = await getAccessToken(CREDS);

      expect(token).toBe("token-abc");
      expect(global.fetch).toHaveBeenCalledWith(
        `${MOMO_BASE_URLS.sandbox}/collection/token/`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Ocp-Apim-Subscription-Key": "sub-key" }),
        }),
      );
    });

    it("throws when MTN rejects the credentials", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(new Response("", { status: 401 }));

      await expect(getAccessToken(CREDS)).rejects.toThrow();
    });
  });

  describe("requestToPay", () => {
    const INPUT = {
      referenceId: "ref-1",
      amount: 5000,
      phoneNumber: "250788000000",
      externalId: "ext-1",
      payerMessage: "Invoice INV-0001",
      payeeNote: "Invoice INV-0001",
    };

    it("succeeds on a 202 with no body", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 202 }));

      await expect(requestToPay(CREDS, "token-abc", INPUT)).resolves.toBeUndefined();
    });

    it("throws when MTN reports a processing error", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ code: "INTERNAL_PROCESSING_ERROR" }), { status: 500 }),
      );

      await expect(requestToPay(CREDS, "token-abc", INPUT)).rejects.toThrow();
    });

    it("throws on an invalid phone number", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(new Response("", { status: 400 }));

      await expect(requestToPay(CREDS, "token-abc", { ...INPUT, phoneNumber: "not-a-phone" })).rejects.toThrow();
    });
  });

  describe("getRequestToPayStatus", () => {
    it("returns SUCCESSFUL", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "SUCCESSFUL" }), { status: 200 }));

      const result = await getRequestToPayStatus(CREDS, "token-abc", "ref-1");

      expect(result).toEqual({ status: "SUCCESSFUL", reason: undefined });
    });

    it("returns FAILED with a reason", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ status: "FAILED", reason: "PAYER_NOT_FOUND" }), { status: 200 }),
      );

      const result = await getRequestToPayStatus(CREDS, "token-abc", "ref-1");

      expect(result).toEqual({ status: "FAILED", reason: "PAYER_NOT_FOUND" });
    });

    it("throws when MTN returns an expired-token error", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(new Response("", { status: 401 }));

      await expect(getRequestToPayStatus(CREDS, "token-abc", "ref-1")).rejects.toThrow();
    });
  });
});
