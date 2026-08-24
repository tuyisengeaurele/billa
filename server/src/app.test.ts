import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("sets security headers via helmet", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  it("allows cross-origin loading of uploaded files (logos, PDFs served to a different origin client)", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });
});
