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

  it("never lets a browser cache the page shell, only its content-hashed asset files", async () => {
    // Regression test: a browser tab open from before a deploy silently kept
    // running the old build (and the old Content-Security-Policy header, in the
    // exact incident this exists to prevent) because nothing told it the shell
    // it already had was allowed to go stale. Its asset files are safe to let
    // the browser cache normally, since a new build ships them under new,
    // content-hashed names - only the shell that names them needs this.
    const shellRes = await request(createApp(clientDistDir))
      .get("/dashboard")
      .set("Accept", "text/html");
    expect(shellRes.headers["cache-control"]).toBe("no-store");

    const assetRes = await request(createApp(clientDistDir)).get("/app.css");
    expect(assetRes.headers["cache-control"]).not.toBe("no-store");
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

  it("allows the Content-Security-Policy the Firebase Auth SDK actually needs", async () => {
    // Regression test: helmet's default CSP only ever wrapped this API's own
    // JSON responses before the client-server merge - once this process also
    // served the real HTML page, that same default (no explicit connect-src)
    // silently blocked the page's own login, both email/password (a fetch
    // straight to Google's identity servers, not this origin) and "Continue
    // with Google" (which loads apis.google.com as a <script>). Confirmed
    // against a real browser, not just this header - see the CSP directive
    // comment in app.ts for the full story.
    const res = await request(createApp()).get("/health");
    const csp = res.headers["content-security-policy"];
    expect(csp).toContain("https://identitytoolkit.googleapis.com");
    expect(csp).toContain("https://securetoken.googleapis.com");
    expect(csp).toContain("https://apis.google.com");
  });

  it("does not set Cross-Origin-Opener-Policy, so Google/Firebase sign-in can report its result back to this page", async () => {
    // Regression test: helmet's default Cross-Origin-Opener-Policy is
    // "same-origin", which silently cuts off a popup or redirect's ability to
    // hand its result back to the page that started it - exactly what Google
    // sign-in needs. This page never had that header before the client-server
    // merge (the client was a separate static site with no helmet in front of
    // it) - sign-in worked then and silently stopped the moment this was added,
    // with nothing in the console to point at why.
    const res = await request(createApp()).get("/health");
    expect(res.headers["cross-origin-opener-policy"]).toBeUndefined();
  });
});
