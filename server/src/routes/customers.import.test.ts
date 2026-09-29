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

describe("POST /customers/import", () => {
  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/customers/import").send({ rows: [{ name: "A" }] });
    expect(res.status).toBe(401);
  });

  it("creates a customer for every valid row", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/customers/import")
      .set("Cookie", cookies)
      .send({ rows: [{ name: "Acme Ltd", phone: "0788123456" }, { name: "Beta Co", email: "hi@beta.rw" }] });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 2, skipped: [], invalid: [] });
    expect(await prisma.customer.count()).toBe(2);
  });

  it("reports an invalid row by its position and imports the rest", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/customers/import")
      .set("Cookie", cookies)
      .send({ rows: [{ name: "Acme Ltd" }, { name: "" }, { name: "Beta", email: "bad" }] });

    expect(res.body.created).toBe(1);
    expect(res.body.invalid).toEqual([
      { row: 2, error: "Enter a customer name" },
      { row: 3, error: "Enter a valid email address" },
    ]);
  });

  it("skips a customer that already exists with the same phone in another format", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd", phone: "+250 788 123 456" });

    const res = await request(app)
      .post("/customers/import")
      .set("Cookie", cookies)
      .send({ rows: [{ name: "Acme Limited", phone: "0788123456" }] });

    expect(res.body.created).toBe(0);
    expect(res.body.skipped).toEqual([{ row: 1, reason: "Already a customer with this phone number" }]);
  });

  it("skips a name that already exists, ignoring case", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });

    const res = await request(app).post("/customers/import").set("Cookie", cookies).send({ rows: [{ name: "acme ltd" }] });

    expect(res.body.skipped).toEqual([{ row: 1, reason: "Already a customer with this name" }]);
  });

  it("skips a repeat inside the file itself", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/customers/import")
      .set("Cookie", cookies)
      .send({ rows: [{ name: "Acme", tin: "123456789" }, { name: "Other", tin: "123456789" }] });

    expect(res.body.created).toBe(1);
    expect(res.body.skipped).toEqual([{ row: 2, reason: "Already a customer with this TIN" }]);
  });

  it("does not see customers of another business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const other = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });
    await request(app)
      .post("/customers")
      .set("Cookie", other.headers["set-cookie"] as unknown as string[])
      .send({ name: "Acme Ltd" });

    const res = await request(app).post("/customers/import").set("Cookie", cookies).send({ rows: [{ name: "Acme Ltd" }] });

    expect(res.body.created).toBe(1);
  });

  it("rejects an empty or oversized request", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const empty = await request(app).post("/customers/import").set("Cookie", cookies).send({ rows: [] });
    const tooMany = await request(app)
      .post("/customers/import")
      .set("Cookie", cookies)
      .send({ rows: Array.from({ length: 501 }, () => ({ name: "A" })) });

    expect(empty.status).toBe(400);
    expect(tooMany.status).toBe(400);
  });
});
