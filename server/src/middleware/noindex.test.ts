import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { isPrivateArea, noindexPrivatePages } from "./noindex.js";

describe("isPrivateArea", () => {
  it("covers private links and the signed-in app", () => {
    for (const path of [
      "/view/abc",
      "/view/abc/pdf",
      "/portal/abc",
      "/invite/abc",
      "/admin/users",
      "/public/documents/abc",
      "/dashboard",
      "/documents/new",
      "/customers/1/statement",
      "/settings",
    ]) {
      expect(isPrivateArea(path), path).toBe(true);
    }
  });

  it("leaves the public marketing pages indexable", () => {
    for (const path of ["/", "/login", "/register", "/help", "/developers", "/contact", "/privacy", "/terms", "/cookies"]) {
      expect(isPrivateArea(path), path).toBe(false);
    }
  });

  it("does not catch a public page that merely starts with the same letters", () => {
    expect(isPrivateArea("/documentation")).toBe(false);
    expect(isPrivateArea("/viewers")).toBe(false);
  });
});

describe("noindexPrivatePages", () => {
  const app = express();
  app.use(noindexPrivatePages);
  app.get("*", (_req, res) => res.send("ok"));

  it("asks search engines to skip a private page", async () => {
    const res = await request(app).get("/view/some-token");
    expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
  });

  it("sends nothing on a public page", async () => {
    const res = await request(app).get("/help");
    expect(res.headers["x-robots-tag"]).toBeUndefined();
  });
});
