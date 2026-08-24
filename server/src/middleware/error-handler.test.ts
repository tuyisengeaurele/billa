import "express-async-errors";
import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { errorHandler } from "./error-handler.js";

function testApp() {
  const app = express();
  app.get("/boom-sync", () => {
    throw new Error("sync failure");
  });
  app.get("/boom-async", async () => {
    throw new Error("async failure");
  });
  app.get("/fine", (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe("errorHandler", () => {
  it("does not interfere with a successful request", async () => {
    const res = await request(testApp()).get("/fine");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("turns a synchronous throw into a generic 500 JSON response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(testApp()).get("/boom-sync");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "internal_error" });
    vi.restoreAllMocks();
  });

  it("turns a rejected async handler into a generic 500 JSON response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(testApp()).get("/boom-async");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "internal_error" });
    vi.restoreAllMocks();
  });
});
