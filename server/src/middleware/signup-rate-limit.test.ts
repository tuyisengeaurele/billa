import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createSignupRateLimit } from "./signup-rate-limit.js";

function testApp(limit: number) {
  const app = express();
  app.use(express.json());
  app.post("/session", createSignupRateLimit(limit), (_req, res) => res.json({ ok: true }));
  return app;
}

describe("createSignupRateLimit", () => {
  it("blocks the account after the limit, but only counts requests that create an account", async () => {
    const app = testApp(3);

    for (let i = 0; i < 3; i++) {
      expect((await request(app).post("/session").send({ idToken: "t", businessName: "My Business" })).status).toBe(200);
    }
    const blocked = await request(app).post("/session").send({ idToken: "t", businessName: "My Business" });

    expect(blocked.status).toBe(429);
  });

  it("never blocks an ordinary sign-in, however many there are", async () => {
    const app = testApp(1);

    for (let i = 0; i < 6; i++) {
      expect((await request(app).post("/session").send({ idToken: "t" })).status).toBe(200);
    }
  });

  it("counts joining through an invite as creating an account", async () => {
    const app = testApp(1);

    await request(app).post("/session").send({ idToken: "t", inviteToken: "abc" });
    const second = await request(app).post("/session").send({ idToken: "t", inviteToken: "abc" });

    expect(second.status).toBe(429);
  });
});
