import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { requireAdmin } from "./require-admin.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";

beforeEach(resetDb);

function testApp(userId: string) {
  const app = express();
  app.use((req, _res, next) => {
    req.auth = { userId, businessId: "irrelevant" };
    next();
  });
  app.get("/probe", requireAdmin, (_req, res) => res.json({ ok: true }));
  return app;
}

async function createUser(email: string) {
  const user = await prisma.user.create({
    data: { email, firebaseUid: crypto.randomUUID(), trialEndsAt: new Date() },
  });
  return user.id;
}

describe("requireAdmin", () => {
  it("allows a user whose email is on the admin allowlist", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    const userId = await createUser("admin@example.com");

    const res = await request(testApp(userId)).get("/probe");

    expect(res.status).toBe(200);
  });

  it("matches the allowlist case-insensitively", async () => {
    process.env.ADMIN_EMAILS = "Admin@Example.com";
    const userId = await createUser("admin@example.com");

    const res = await request(testApp(userId)).get("/probe");

    expect(res.status).toBe(200);
  });

  it("blocks a user whose email isn't on the allowlist", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    const userId = await createUser("someone-else@example.com");

    const res = await request(testApp(userId)).get("/probe");

    expect(res.status).toBe(403);
  });

  it("blocks everyone when no allowlist is configured", async () => {
    delete process.env.ADMIN_EMAILS;
    const userId = await createUser("admin@example.com");

    const res = await request(testApp(userId)).get("/probe");

    expect(res.status).toBe(403);
  });
});
