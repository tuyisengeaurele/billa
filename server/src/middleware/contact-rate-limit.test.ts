import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createContactRateLimit } from "./contact-rate-limit.js";

function testApp() {
  const app = express();
  app.post("/probe", createContactRateLimit(5), (_req, res) => res.json({ ok: true }));
  return app;
}

describe("createContactRateLimit(5), the production limit", () => {
  it("allows requests under the limit", async () => {
    const app = testApp();
    const res = await request(app).post("/probe");
    expect(res.status).toBe(200);
  });

  it("blocks after exceeding the limit", async () => {
    const app = testApp();
    for (let i = 0; i < 5; i++) {
      await request(app).post("/probe");
    }
    const res = await request(app).post("/probe");
    expect(res.status).toBe(429);
  });
});
