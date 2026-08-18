import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

async function registerUser(app: ReturnType<typeof createApp>) {
  await request(app).post("/auth/register").send({
    email: "owner@example.com",
    password: "supersecret1",
    businessName: "Kigali Traders",
  });
}

describe("POST /auth/login", () => {
  it("logs in with correct credentials and sets cookies", async () => {
    const app = createApp();
    await registerUser(app);

    const res = await request(app).post("/auth/login").send({
      email: "owner@example.com",
      password: "supersecret1",
    });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("owner@example.com");
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("access_token="))).toBe(true);
  });

  it("rejects a wrong password with 401", async () => {
    const app = createApp();
    await registerUser(app);

    const res = await request(app).post("/auth/login").send({
      email: "owner@example.com",
      password: "wrongpassword",
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_credentials");
  });

  it("rejects an unknown email with 401", async () => {
    const res = await request(createApp()).post("/auth/login").send({
      email: "nobody@example.com",
      password: "whatever1",
    });
    expect(res.status).toBe(401);
  });
});
