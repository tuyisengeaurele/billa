import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import { redactUrl, requestLogger } from "./request-logger.js";

describe("requestLogger", () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it("logs the method, path (without the query), status code, and duration for each request", async () => {
    process.env.NODE_ENV = "development";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = express();
    app.use(requestLogger);
    app.get("/ping", (_req, res) => res.status(200).json({ ok: true }));

    await request(app).get("/ping?foo=bar");

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toContain("GET");
    expect(line).toContain("/ping");
    expect(line).not.toContain("foo=bar");
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

describe("redactUrl", () => {
  it("drops the query string, which can carry names, emails and search terms", () => {
    expect(redactUrl("/customers?search=jean%20uwase&page=2")).toBe("/customers");
    expect(redactUrl("/documents/abc123/pdf?x=1#top")).toBe("/documents/abc123/pdf");
  });

  it("hides the secret in invoice, statement and invite links", () => {
    expect(redactUrl("/view/6f1c2e9a-aaaa-bbbb-cccc-1234567890ab")).toBe("/view/[redacted]");
    expect(redactUrl("/portal/tok-123?x=1")).toBe("/portal/[redacted]");
    expect(redactUrl("/invite/abcdef")).toBe("/invite/[redacted]");
    expect(redactUrl("/public/documents/tok-123")).toBe("/public/documents/[redacted]");
    expect(redactUrl("/public/documents/tok-123/pdf")).toBe("/public/documents/[redacted]/pdf");
    expect(redactUrl("/public/documents/tok-123/momo/request/req9")).toBe(
      "/public/documents/[redacted]/momo/request/req9",
    );
    expect(redactUrl("/public/customers/tok-9")).toBe("/public/customers/[redacted]");
  });

  it("leaves ordinary addresses alone", () => {
    expect(redactUrl("/documents/cm123/edit")).toBe("/documents/cm123/edit");
    expect(redactUrl("/health")).toBe("/health");
    expect(redactUrl("/")).toBe("/");
  });
});
