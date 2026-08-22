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

async function registerWithExpiredTrial(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  const cookies = res.headers["set-cookie"] as unknown as string[];
  await prisma.user.update({
    where: { id: res.body.user.id },
    data: { trialEndsAt: new Date(Date.now() - 1000) },
  });
  return cookies;
}

describe("subscription gate", () => {
  it("blocks creating a document once the trial has lapsed", async () => {
    const app = createApp();
    const cookies = await registerWithExpiredTrial(app);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "INVOICE", customerId: "x", issueDate: "2026-08-21", lines: [] });

    expect(res.status).toBe(402);
  });

  it("blocks creating a customer once the trial has lapsed", async () => {
    const app = createApp();
    const cookies = await registerWithExpiredTrial(app);

    const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Musanze Supplies" });

    expect(res.status).toBe(402);
  });

  it("blocks creating an item once the trial has lapsed", async () => {
    const app = createApp();
    const cookies = await registerWithExpiredTrial(app);

    const res = await request(app)
      .post("/items")
      .set("Cookie", cookies)
      .send({ description: "Printing", unitPrice: 5000, unit: "service" });

    expect(res.status).toBe(402);
  });

  it("still allows reading documents once the trial has lapsed", async () => {
    const app = createApp();
    const cookies = await registerWithExpiredTrial(app);

    const res = await request(app).get("/documents?type=INVOICE").set("Cookie", cookies);

    expect(res.status).toBe(200);
  });
});
