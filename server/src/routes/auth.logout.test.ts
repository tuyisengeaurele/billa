import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

describe("POST /auth/logout", () => {
  it("revokes the refresh token and clears cookies", async () => {
    const app = createApp();
    const registerRes = await request(app).post("/auth/register").send({
      email: "owner@example.com",
      password: "supersecret1",
      businessName: "Kigali Traders",
    });
    const cookies = registerRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).post("/auth/logout").set("Cookie", cookies);

    expect(res.status).toBe(200);
    const clearedCookies = res.headers["set-cookie"] as unknown as string[];
    expect(clearedCookies.some((c) => c.startsWith("access_token=;"))).toBe(true);

    const tokens = await prisma.refreshToken.findMany();
    expect(tokens.every((t) => t.revokedAt !== null)).toBe(true);
  });

  it("succeeds even with no session", async () => {
    const res = await request(createApp()).post("/auth/logout");
    expect(res.status).toBe(200);
  });
});
