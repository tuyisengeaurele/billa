import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";
import { prisma } from "../lib/prisma.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

describe("POST /items/import", () => {
  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/items/import").send({ rows: [{ description: "A", unitPrice: "1" }] });
    expect(res.status).toBe(401);
  });

  it("creates an item per valid row, reading prices written with commas", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/items/import")
      .set("Cookie", cookies)
      .send({
        rows: [
          { description: "Cement", unitPrice: "12,500", unit: "bag", taxRate: "18" },
          { description: "Consulting", unitPrice: "50000" },
        ],
      });

    expect(res.body).toMatchObject({ created: 2, skipped: [], invalid: [] });
    const cement = await prisma.item.findFirstOrThrow({ where: { description: "Cement" } });
    expect(cement.unitPrice).toBe(12500);
    const consulting = await prisma.item.findFirstOrThrow({ where: { description: "Consulting" } });
    expect(consulting.unit).toBe("each");
    expect(Number(consulting.taxRate)).toBe(18);
  });

  it("reports invalid rows by position and imports the rest", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/items/import")
      .set("Cookie", cookies)
      .send({ rows: [{ description: "Pen", unitPrice: "200" }, { description: "", unitPrice: "5" }, { description: "Free", unitPrice: "0" }] });

    expect(res.body.created).toBe(1);
    expect(res.body.invalid.map((entry: { row: number }) => entry.row)).toEqual([2, 3]);
  });

  it("skips an item whose description and unit already exist, ignoring case", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await request(app).post("/items").set("Cookie", cookies).send({ description: "Cement", unitPrice: 12000, unit: "bag" });

    const res = await request(app)
      .post("/items/import")
      .set("Cookie", cookies)
      .send({
        rows: [
          { description: "cement", unitPrice: "13000", unit: "BAG" },
          { description: "Cement", unitPrice: "900", unit: "kg" },
        ],
      });

    expect(res.body.created).toBe(1);
    expect(res.body.skipped).toEqual([{ row: 1, reason: "Already an item with this description and unit" }]);
  });

  it("skips a repeat inside the file itself", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/items/import")
      .set("Cookie", cookies)
      .send({ rows: [{ description: "Pen", unitPrice: "100" }, { description: "Pen", unitPrice: "150" }] });

    expect(res.body.created).toBe(1);
    expect(res.body.skipped).toHaveLength(1);
  });

  it("rejects an empty request", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).post("/items/import").set("Cookie", cookies).send({ rows: [] });

    expect(res.status).toBe(400);
  });
});
