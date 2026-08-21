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

describe("GET /business/sequences", () => {
  it("returns computed defaults for all 5 types when none are saved", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).get("/business/sequences").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.sequences).toHaveLength(5);
    expect(res.body.sequences).toContainEqual({ type: "INVOICE", prefix: "INV-", nextNumber: 1 });
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/business/sequences");
    expect(res.status).toBe(401);
  });
});
