import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createAuthRateLimit } from "./auth-rate-limit.js";

function testApp(limit: number) {
  const app = express();
  app.post("/probe", createAuthRateLimit(limit), (_req, res) => res.json({ ok: true }));
  return app;
}

describe("createAuthRateLimit", () => {
  it("allows requests under the limit", async () => {
    const app = testApp(10);
    const res = await request(app).post("/probe");
    expect(res.status).toBe(200);
  });

  it("blocks after exceeding the limit", async () => {
    const app = testApp(10);
    for (let i = 0; i < 10; i++) {
      await request(app).post("/probe");
    }
    const res = await request(app).post("/probe");
    expect(res.status).toBe(429);
  });
});
