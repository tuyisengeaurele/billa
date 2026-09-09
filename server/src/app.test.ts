import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

describe("serving the built client", () => {
  let clientDistDir: string;

  beforeEach(async () => {
    clientDistDir = await mkdtemp(path.join(os.tmpdir(), "billa-client-dist-"));
    await writeFile(path.join(clientDistDir, "index.html"), "<!doctype html><title>Billa</title>");
    await writeFile(path.join(clientDistDir, "app.css"), "body { color: red; }");
  });

  afterEach(async () => {
    await rm(clientDistDir, { recursive: true, force: true });
  });

  it("serves a built static asset by its own path", async () => {
    const res = await request(createApp(clientDistDir)).get("/app.css");
    expect(res.status).toBe(200);
    expect(res.text).toContain("color: red");
  });

  it("falls back to index.html for a client-side route, so a page refresh doesn't 404", async () => {
    const res = await request(createApp(clientDistDir))
      .get("/dashboard")
      .set("Accept", "text/html,application/xhtml+xml");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>Billa</title>");
  });

  it("does not swallow an unmatched API path into the SPA fallback", async () => {
    const res = await request(createApp(clientDistDir))
      .get("/documents/does-not-exist-as-a-route")
      .set("Accept", "application/json");
    expect(res.status).not.toBe(200);
    expect(res.text).not.toContain("<title>Billa</title>");
  });

  it("serves the page shell for a browser navigation to /documents, not the API's own JSON list at that same path", async () => {
    // Regression test: GET /documents is both "the Documents page" to a browser
    // and "list documents" to the client's own fetch calls - the exact class of
    // collision this whole ordering exists to resolve. A real navigation must
    // win here, not documentsRouter's list handler.
    const res = await request(createApp(clientDistDir))
      .get("/documents")
      .set("Accept", "text/html,application/xhtml+xml");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>Billa</title>");
  });

  it("still serves the real API's JSON for an actual fetch call to a colliding path", async () => {
    const res = await request(createApp(clientDistDir)).get("/documents").set("Accept", "*/*");
    // No session cookie, so the real documentsRouter (behind requireAuth) 401s -
    // the point is that it's the API's own response, not the SPA shell (200).
    expect(res.status).toBe(401);
  });

  it("still serves a PDF for a direct navigation to it, instead of the SPA shell", async () => {
    // PDFs are opened via window.open/<a href> (a real navigation, same Accept
    // header as any page load), not fetch() - without an explicit exception,
    // this path shape would otherwise get swallowed by the same rule that
    // correctly protects every actual page route.
    const res = await request(createApp(clientDistDir))
      .get("/documents/doc-123/pdf")
      .set("Accept", "text/html,application/xhtml+xml");
    expect(res.text).not.toContain("<title>Billa</title>");
  });

  it("stays a no-op when no client build exists (local dev)", async () => {
    const noBuildDir = path.join(clientDistDir, "does-not-exist");
    const res = await request(createApp(noBuildDir)).get("/dashboard").set("Accept", "text/html");
    expect(res.status).not.toBe(200);
  });
});

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
