import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isKnownClientRoute } from "./client-routes.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("isKnownClientRoute", () => {
  it("accepts the pages the app has, with or without a trailing slash", () => {
    for (const route of ["/", "/login", "/help", "/help/", "/documents/new", "/documents/abc123", "/documents/abc123/edit"]) {
      expect(isKnownClientRoute(route), route).toBe(true);
    }
    expect(isKnownClientRoute("/view/6f1c2e9a-aaaa-bbbb-cccc-1234567890ab")).toBe(true);
    expect(isKnownClientRoute("/customers/c1/statement")).toBe(true);
    expect(isKnownClientRoute("/admin/users/u1")).toBe(true);
  });

  it("rejects addresses that are not pages", () => {
    for (const route of [
      "/nope",
      "/documents/abc/edit/extra",
      "/view",
      "/view/a/b",
      "/helpme",
      "/wp-login.php",
      "/.env",
      "/dashboard/x",
    ]) {
      expect(isKnownClientRoute(route), route).toBe(false);
    }
  });

  it("covers every page route declared in the client's App.tsx", () => {
    const app = fs.readFileSync(path.resolve(here, "../../../client/src/App.tsx"), "utf8");
    const declared = [...app.matchAll(/path="([^"]+)"/g)].map((match) => match[1]!).filter((route) => route !== "*");

    expect(declared.length).toBeGreaterThan(30);
    for (const route of declared) {
      const example = route.replace(/:[A-Za-z]+/g, "example");
      expect(isKnownClientRoute(example), `${route} is in App.tsx but not in client-routes.ts`).toBe(true);
    }
  });
});
