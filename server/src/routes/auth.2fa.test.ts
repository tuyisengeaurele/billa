import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { authenticator } from "otplib";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

async function registerAndGetCookies(app: ReturnType<typeof createApp>, email = "owner@example.com") {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: email, email }),
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

async function setUpAndEnableTwoFactor(app: ReturnType<typeof createApp>, cookies: string[]) {
  const setupRes = await request(app).post("/auth/2fa/setup").set("Cookie", cookies);
  const secret = setupRes.body.secret as string;
  const code = authenticator.generate(secret);
  const verifyRes = await request(app).post("/auth/2fa/verify").set("Cookie", cookies).send({ code });
  return { secret, backupCodes: verifyRes.body.backupCodes as string[] };
}

describe("POST /auth/2fa/setup", () => {
  it("returns a secret, otpauth URL, and QR code for the signed-in user", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).post("/auth/2fa/setup").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.secret).toMatch(/^[A-Z2-7]+$/);
    expect(res.body.otpauthUrl).toContain("otpauth://totp/");
    expect(res.body.qrCodeDataUri).toMatch(/^data:image\/png;base64,/);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/auth/2fa/setup");
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/2fa/verify", () => {
  it("enables 2FA and returns backup codes for a correct code", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const setupRes = await request(app).post("/auth/2fa/setup").set("Cookie", cookies);
    const code = authenticator.generate(setupRes.body.secret);

    const res = await request(app).post("/auth/2fa/verify").set("Cookie", cookies).send({ code });

    expect(res.status).toBe(200);
    expect(res.body.backupCodes).toHaveLength(8);
  });

  it("rejects a wrong code and leaves 2FA disabled", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await request(app).post("/auth/2fa/setup").set("Cookie", cookies);

    const res = await request(app).post("/auth/2fa/verify").set("Cookie", cookies).send({ code: "000000" });

    expect(res.status).toBe(400);
  });
});

describe("POST /auth/session with 2FA enabled", () => {
  it("returns a challenge instead of a session, and does not set auth cookies", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await setUpAndEnableTwoFactor(app, cookies);

    const res = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    });

    expect(res.status).toBe(200);
    expect(res.body.twoFactorRequired).toBe(true);
    expect(res.body.challengeId).toEqual(expect.any(String));
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});

describe("POST /auth/2fa/challenge", () => {
  it("issues a real session for a correct TOTP code", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const { secret } = await setUpAndEnableTwoFactor(app, cookies);

    const sessionRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    });
    const challengeId = sessionRes.body.challengeId as string;

    const res = await request(app)
      .post("/auth/2fa/challenge")
      .send({ challengeId, code: authenticator.generate(secret) });

    expect(res.status).toBe(200);
    expect(res.body.business.name).toBe("Kigali Traders");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("issues a session for a correct backup code and consumes it", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const { backupCodes } = await setUpAndEnableTwoFactor(app, cookies);

    const sessionRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    });
    const firstChallenge = sessionRes.body.challengeId as string;

    const res = await request(app)
      .post("/auth/2fa/challenge")
      .send({ challengeId: firstChallenge, code: backupCodes[0] });
    expect(res.status).toBe(200);

    // the same backup code must not work a second time
    const sessionRes2 = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    });
    const secondChallenge = sessionRes2.body.challengeId as string;
    const reuseRes = await request(app)
      .post("/auth/2fa/challenge")
      .send({ challengeId: secondChallenge, code: backupCodes[0] });
    expect(reuseRes.status).toBe(401);
  });

  it("rejects a wrong code", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await setUpAndEnableTwoFactor(app, cookies);
    const sessionRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    });

    const res = await request(app)
      .post("/auth/2fa/challenge")
      .send({ challengeId: sessionRes.body.challengeId, code: "000000" });

    expect(res.status).toBe(401);
  });

  it("rejects an unknown challengeId", async () => {
    const res = await request(createApp()).post("/auth/2fa/challenge").send({ challengeId: "nope", code: "123456" });
    expect(res.status).toBe(401);
  });

  it("rejects an expired challenge", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const { secret } = await setUpAndEnableTwoFactor(app, cookies);
    const sessionRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    });
    await prisma.twoFactorChallenge.update({
      where: { id: sessionRes.body.challengeId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app)
      .post("/auth/2fa/challenge")
      .send({ challengeId: sessionRes.body.challengeId, code: authenticator.generate(secret) });

    expect(res.status).toBe(401);
  });
});

describe("POST /auth/2fa/disable", () => {
  it("disables 2FA with a correct code, and future logins skip the challenge", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const { secret } = await setUpAndEnableTwoFactor(app, cookies);

    const res = await request(app)
      .post("/auth/2fa/disable")
      .set("Cookie", cookies)
      .send({ code: authenticator.generate(secret) });
    expect(res.status).toBe(200);

    const sessionRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    });
    expect(sessionRes.body.twoFactorRequired).toBeUndefined();
    expect(sessionRes.headers["set-cookie"]).toBeDefined();
  });

  it("rejects a wrong code and leaves 2FA enabled", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await setUpAndEnableTwoFactor(app, cookies);

    const res = await request(app).post("/auth/2fa/disable").set("Cookie", cookies).send({ code: "000000" });

    expect(res.status).toBe(400);
  });
});
