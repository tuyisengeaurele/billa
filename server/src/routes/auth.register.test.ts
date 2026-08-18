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

describe("POST /auth/register", () => {
  it("creates a business and owner user, and sets session cookies", async () => {
    const res = await request(createApp()).post("/auth/register").send({
      email: "owner@example.com",
      password: "supersecret1",
      businessName: "Kigali Traders",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("owner@example.com");
    expect(res.body.business.name).toBe("Kigali Traders");

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("access_token="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("refresh_token="))).toBe(true);

    const user = await prisma.user.findUnique({ where: { email: "owner@example.com" } });
    expect(user).not.toBeNull();
    const refreshTokens = await prisma.refreshToken.findMany({ where: { userId: user!.id } });
    expect(refreshTokens).toHaveLength(1);
  });

  it("rejects a duplicate email with 409", async () => {
    const app = createApp();
    await request(app).post("/auth/register").send({
      email: "owner@example.com",
      password: "supersecret1",
      businessName: "Kigali Traders",
    });

    const res = await request(app).post("/auth/register").send({
      email: "owner@example.com",
      password: "anotherpassword",
      businessName: "Another Business",
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("email_taken");
  });

  it("rejects an invalid body with 400", async () => {
    const res = await request(createApp()).post("/auth/register").send({
      email: "not-an-email",
      password: "short",
      businessName: "",
    });
    expect(res.status).toBe(400);
  });
});
