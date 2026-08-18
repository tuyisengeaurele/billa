import { beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import cookieParser from "cookie-parser";
import { signAccessToken } from "../lib/tokens.js";
import { requireAuth } from "./require-auth.js";

beforeEach(() => {
  process.env.JWT_ACCESS_SECRET = "test-secret";
});

function testApp() {
  const app = express();
  app.use(cookieParser());
  app.get("/probe", requireAuth, (req, res) => res.json({ auth: req.auth }));
  return app;
}

describe("requireAuth", () => {
  it("attaches req.auth for a valid access token cookie", async () => {
    const token = signAccessToken({ userId: "u1", businessId: "b1" });
    const res = await request(testApp()).get("/probe").set("Cookie", [`access_token=${token}`]);
    expect(res.status).toBe(200);
    expect(res.body.auth).toMatchObject({ userId: "u1", businessId: "b1" });
  });

  it("returns 401 with no cookie", async () => {
    const res = await request(testApp()).get("/probe");
    expect(res.status).toBe(401);
  });

  it("returns 401 with an invalid token", async () => {
    const res = await request(testApp()).get("/probe").set("Cookie", ["access_token=garbage"]);
    expect(res.status).toBe(401);
  });
});
