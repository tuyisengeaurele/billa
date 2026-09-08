import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import { requestLogger } from "./request-logger.js";

describe("requestLogger", () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it("logs the method, path (with query), status code, and duration for each request", async () => {
    process.env.NODE_ENV = "development";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = express();
    app.use(requestLogger);
    app.get("/ping", (_req, res) => res.status(200).json({ ok: true }));

    await request(app).get("/ping?foo=bar");

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toContain("GET");
    expect(line).toContain("/ping?foo=bar");
    expect(line).toContain("200");
    expect(line).toMatch(/\d+(\.\d+)?ms/);
  });

  it("logs a non-200 status code correctly", async () => {
    process.env.NODE_ENV = "development";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = express();
    app.use(requestLogger);
    app.get("/missing", (_req, res) => res.status(404).json({ error: "not_found" }));

    await request(app).get("/missing");

    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toContain("404");
  });

  it("does not log while NODE_ENV is test, to keep test output readable", async () => {
    process.env.NODE_ENV = "test";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = express();
    app.use(requestLogger);
    app.get("/ping", (_req, res) => res.status(200).json({ ok: true }));

    await request(app).get("/ping");

    expect(logSpy).not.toHaveBeenCalled();
  });
});
