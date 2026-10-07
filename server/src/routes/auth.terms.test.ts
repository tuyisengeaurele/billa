import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

const token = (email: string) => JSON.stringify({ uid: email, email });

describe("recording that the terms were accepted", () => {
  it("stores when a new account agreed to the terms", async () => {
    const before = Date.now();

    const res = await request(createApp())
      .post("/auth/session")
      .send({ idToken: token("a@example.com"), businessName: "Kigali Traders", acceptedTerms: true });

    expect(res.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "a@example.com" } });
    expect(user.termsAcceptedAt).not.toBeNull();
    expect(user.termsAcceptedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("stores nothing when the sign-up did not say so, such as an older app", async () => {
    await request(createApp()).post("/auth/session").send({ idToken: token("b@example.com"), businessName: "Shop" });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "b@example.com" } });
    expect(user.termsAcceptedAt).toBeNull();
  });

  it("does not change the date when the same person signs in again", async () => {
    const app = createApp();
    await request(app)
      .post("/auth/session")
      .send({ idToken: token("c@example.com"), businessName: "Shop", acceptedTerms: true });
    const first = (await prisma.user.findUniqueOrThrow({ where: { email: "c@example.com" } })).termsAcceptedAt;

    await request(app).post("/auth/session").send({ idToken: token("c@example.com") });

    const second = (await prisma.user.findUniqueOrThrow({ where: { email: "c@example.com" } })).termsAcceptedAt;
    expect(second).toEqual(first);
  });
});
