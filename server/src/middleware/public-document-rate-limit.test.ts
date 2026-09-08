import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createPublicDocumentRateLimit } from "./public-document-rate-limit.js";

function testApp(limit: number) {
  const app = express();
  app.get("/probe", createPublicDocumentRateLimit(limit, 15 * 60 * 1000), (_req, res) => res.json({ ok: true }));
  return app;
}

describe("createPublicDocumentRateLimit", () => {
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
});
