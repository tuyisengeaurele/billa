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

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/register").send({
    email: "owner@example.com",
    password: "Supersecret1!",
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

describe("PUT /business/sequences", () => {
  it("saves a custom prefix and starting number for one type", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .put("/business/sequences")
      .set("Cookie", cookies)
      .send([{ type: "INVOICE", prefix: "KGL-", nextNumber: 100 }]);

    expect(res.status).toBe(200);
    expect(res.body.sequences).toContainEqual({ type: "INVOICE", prefix: "KGL-", nextNumber: 100 });
    expect(res.body.sequences).toContainEqual({ type: "QUOTE", prefix: "QTE-", nextNumber: 1 });

    const rows = await prisma.documentSequence.findMany();
    expect(rows).toHaveLength(1);
  });

  it("upserts on a second call rather than duplicating", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    await request(app)
      .put("/business/sequences")
      .set("Cookie", cookies)
      .send([{ type: "INVOICE", prefix: "KGL-", nextNumber: 100 }]);

    await request(app)
      .put("/business/sequences")
      .set("Cookie", cookies)
      .send([{ type: "INVOICE", prefix: "KGL-", nextNumber: 150 }]);

    const rows = await prisma.documentSequence.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].nextNumber).toBe(150);
  });

  it("rejects duplicate types in the same request with 400", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .put("/business/sequences")
      .set("Cookie", cookies)
      .send([
        { type: "INVOICE", prefix: "A-", nextNumber: 1 },
        { type: "INVOICE", prefix: "B-", nextNumber: 1 },
      ]);

    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp())
      .put("/business/sequences")
      .send([{ type: "INVOICE", prefix: "KGL-", nextNumber: 100 }]);
    expect(res.status).toBe(401);
  });
});
