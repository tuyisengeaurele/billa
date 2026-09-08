import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";
import { prisma } from "../lib/prisma.js";
import * as momoClientModule from "../lib/momo-client.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
  process.env.MOMO_CREDENTIALS_ENCRYPTION_KEY ??= Buffer.alloc(32, 5).toString("base64");
});

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
});

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

describe("GET /business/momo-settings", () => {
  it("returns disabled, unconfigured defaults for a new business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).get("/business/momo-settings").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false, environment: null, targetEnvironment: null, configured: false });
  });
});

describe("PATCH /business/momo-settings", () => {
  it("encrypts and saves sandbox credentials", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).patch("/business/momo-settings").set("Cookie", cookies).send({
      enabled: true,
      environment: "sandbox",
      subscriptionKey: "sub-key",
      apiUser: "api-user",
      apiKey: "api-key",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: true, environment: "sandbox", targetEnvironment: "sandbox", configured: true });

    const business = await prisma.business.findFirstOrThrow({ where: { name: "Kigali Traders" } });
    expect(business.momoSubscriptionKeyEnc).not.toBeNull();
    expect(business.momoSubscriptionKeyEnc).not.toBe("sub-key");
  });

  it("requires a target environment for production", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).patch("/business/momo-settings").set("Cookie", cookies).send({
      enabled: true,
      environment: "production",
      subscriptionKey: "sub-key",
      apiUser: "api-user",
      apiKey: "api-key",
    });

    expect(res.status).toBe(400);
  });

  it("never returns the saved credentials in the response", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).patch("/business/momo-settings").set("Cookie", cookies).send({
      enabled: true,
      environment: "sandbox",
      subscriptionKey: "sub-key",
      apiUser: "api-user",
      apiKey: "api-key",
    });

    expect(JSON.stringify(res.body)).not.toContain("sub-key");
  });
});

describe("POST /business/momo-settings/test", () => {
  it("returns ok when MTN accepts the credentials", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-abc");

    const res = await request(app).post("/business/momo-settings/test").set("Cookie", cookies).send({
      environment: "sandbox",
      subscriptionKey: "sub-key",
      apiUser: "api-user",
      apiKey: "api-key",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("returns ok:false with the error when MTN rejects the credentials", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    vi.spyOn(momoClientModule, "getAccessToken").mockRejectedValue(new Error("Couldn't authenticate with MTN MoMo"));

    const res = await request(app).post("/business/momo-settings/test").set("Cookie", cookies).send({
      environment: "sandbox",
      subscriptionKey: "bad-key",
      apiUser: "api-user",
      apiKey: "api-key",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: false, error: "Couldn't authenticate with MTN MoMo" });
  });

  it("tests the already-saved credentials when none are given in the body", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await request(app).patch("/business/momo-settings").set("Cookie", cookies).send({
      enabled: true,
      environment: "sandbox",
      subscriptionKey: "sub-key",
      apiUser: "api-user",
      apiKey: "api-key",
    });
    const getTokenSpy = vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-abc");

    const res = await request(app).post("/business/momo-settings/test").set("Cookie", cookies).send({});

    expect(res.body).toEqual({ ok: true });
    expect(getTokenSpy).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionKey: "sub-key", apiUser: "api-user", apiKey: "api-key" }),
    );
  });
});
