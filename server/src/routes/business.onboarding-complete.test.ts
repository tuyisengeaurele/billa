import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

describe("POST /business/onboarding/complete", () => {
  it("marks the business as having completed onboarding", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const before = await request(app).get("/business").set("Cookie", cookies);
    expect(before.body.business.onboardingCompletedAt).toBeNull();

    const res = await request(app).post("/business/onboarding/complete").set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.body.business.onboardingCompletedAt).not.toBeNull();

    const after = await request(app).get("/business").set("Cookie", cookies);
    expect(after.body.business.onboardingCompletedAt).not.toBeNull();
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/business/onboarding/complete");
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/session", () => {
  it("reports onboardingCompletedAt so the client knows whether to show onboarding", async () => {
    const app = createApp();
    const registerRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "fresh@example.com", email: "fresh@example.com" }),
      businessName: "Fresh Co",
    });
    expect(registerRes.body.business.onboardingCompletedAt).toBeNull();

    const cookies = registerRes.headers["set-cookie"] as unknown as string[];
    await request(app).post("/business/onboarding/complete").set("Cookie", cookies);

    const loginRes = await request(app)
      .post("/auth/session")
      .send({ idToken: JSON.stringify({ uid: "fresh@example.com", email: "fresh@example.com" }) });
    expect(loginRes.body.business.onboardingCompletedAt).not.toBeNull();
  });
});
