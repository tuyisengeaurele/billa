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

async function createUser(email: string, isAdmin: boolean, totpEnabled = false) {
  const user = await prisma.user.create({
    data: { email, firebaseUid: crypto.randomUUID(), trialEndsAt: new Date(), isAdmin, totpEnabled },
  });
  return user.id;
}

describe("requireAdmin", () => {
  it("allows an admin with 2FA enabled", async () => {
    const userId = await createUser("admin@example.com", true, true);

    const res = await request(testApp(userId)).get("/probe");

    expect(res.status).toBe(200);
  });

  it("blocks a user without isAdmin set", async () => {
    const userId = await createUser("someone-else@example.com", false);

    const res = await request(testApp(userId)).get("/probe");

    expect(res.status).toBe(403);
  });

  it("blocks an admin who hasn't enabled 2FA", async () => {
    // Admin routes reach every business's data, so isAdmin alone isn't enough -
    // the account also has to have turned on two-factor first.
    const userId = await createUser("admin@example.com", true, false);

    const res = await request(testApp(userId)).get("/probe");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("admin_requires_2fa");
  });

  it("blocks a request for a user that no longer exists", async () => {
    const res = await request(testApp("nonexistent-user-id")).get("/probe");

    expect(res.status).toBe(403);
  });
});
