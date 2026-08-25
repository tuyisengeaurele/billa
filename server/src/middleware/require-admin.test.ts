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

async function createUser(email: string, isAdmin: boolean) {
  const user = await prisma.user.create({
    data: { email, firebaseUid: crypto.randomUUID(), trialEndsAt: new Date(), isAdmin },
  });
  return user.id;
}

describe("requireAdmin", () => {
  it("allows a user with isAdmin set", async () => {
    const userId = await createUser("admin@example.com", true);

    const res = await request(testApp(userId)).get("/probe");

    expect(res.status).toBe(200);
  });

  it("blocks a user without isAdmin set", async () => {
    const userId = await createUser("someone-else@example.com", false);

    const res = await request(testApp(userId)).get("/probe");

    expect(res.status).toBe(403);
  });

  it("blocks a request for a user that no longer exists", async () => {
    const res = await request(testApp("nonexistent-user-id")).get("/probe");

    expect(res.status).toBe(403);
  });
});
