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

function refreshCookie(cookies: string[]): string {
  const raw = cookies.find((c) => c.startsWith("refresh_token="));
  if (!raw) throw new Error("no refresh_token cookie in response");
  return raw.split(";")[0];
}

async function registerAndGetRefreshCookie(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/register").send({
    email: "owner@example.com",
    password: "supersecret1",
    businessName: "Kigali Traders",
  });
  return refreshCookie(res.headers["set-cookie"] as unknown as string[]);
}

describe("POST /auth/refresh", () => {
  it("rotates the refresh token and issues a new access token", async () => {
    const app = createApp();
    const cookie = await registerAndGetRefreshCookie(app);

    const res = await request(app).post("/auth/refresh").set("Cookie", [cookie]);

    expect(res.status).toBe(200);
    const newCookies = res.headers["set-cookie"] as unknown as string[];
    expect(newCookies.some((c) => c.startsWith("access_token="))).toBe(true);
    expect(newCookies.some((c) => c.startsWith("refresh_token="))).toBe(true);

    const tokens = await prisma.refreshToken.findMany();
    expect(tokens).toHaveLength(2);
    expect(tokens.filter((t) => t.revokedAt !== null)).toHaveLength(1);
    expect(tokens[0].family).toBe(tokens[1].family);
  });

  it("detects reuse of a revoked token and revokes the whole family", async () => {
    const app = createApp();
    const cookie = await registerAndGetRefreshCookie(app);

    await request(app).post("/auth/refresh").set("Cookie", [cookie]);

    const res = await request(app).post("/auth/refresh").set("Cookie", [cookie]);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("token_reuse_detected");

    const tokens = await prisma.refreshToken.findMany();
    expect(tokens.every((t) => t.revokedAt !== null)).toBe(true);
  });

  it("returns 401 with no refresh cookie", async () => {
    const res = await request(createApp()).post("/auth/refresh");
    expect(res.status).toBe(401);
  });
});
