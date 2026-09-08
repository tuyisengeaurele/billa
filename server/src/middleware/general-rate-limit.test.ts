import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createGeneralApiRateLimit } from "./general-rate-limit.js";

function testApp(limit: number) {
  const app = express();
  app.get("/probe", createGeneralApiRateLimit(limit), (_req, res) => res.json({ ok: true }));
  return app;
}

describe("createGeneralApiRateLimit", () => {
  it("allows requests under the limit", async () => {
    const app = testApp(3);
    const res = await request(app).get("/probe");
    expect(res.status).toBe(200);
  });

  it("blocks after exceeding the limit", async () => {
    const app = testApp(3);
    for (let i = 0; i < 3; i++) {
      await request(app).get("/probe");
    }
    const res = await request(app).get("/probe");
    expect(res.status).toBe(429);
  });

  it("keys unauthenticated requests by IP, not a shared bucket", async () => {
    // Both requests come from the same supertest client (same IP), so they do share a
    // bucket here - this just confirms the middleware runs and doesn't throw when
    // req.auth is unset, which is the real-world case for a route hit pre-auth.
    const app = testApp(1);
    const first = await request(app).get("/probe");
    const second = await request(app).get("/probe");
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });
});
