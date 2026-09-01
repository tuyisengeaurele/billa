import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";

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

async function createItem(app: ReturnType<typeof createApp>, cookies: string[]) {
  const res = await request(app)
    .post("/items")
    .set("Cookie", cookies)
    .send({ description: "Printing service", unitPrice: 5000, unit: "service" });
  return res.body.item.id as string;
}

describe("PATCH /items/:id", () => {
  it("updates the provided fields", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createItem(app, cookies);

    const res = await request(app).patch(`/items/${id}`).set("Cookie", cookies).send({ unitPrice: 6000 });

    expect(res.status).toBe(200);
    expect(res.body.item.unitPrice).toBe(6000);
  });

  it("updates the tax rate", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createItem(app, cookies);

    const res = await request(app).patch(`/items/${id}`).set("Cookie", cookies).send({ taxRate: 0 });

    expect(res.status).toBe(200);
    expect(Number(res.body.item.taxRate)).toBe(0);
  });

  it("deactivates and reactivates via isActive", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createItem(app, cookies);

    const deactivated = await request(app).patch(`/items/${id}`).set("Cookie", cookies).send({ isActive: false });
    expect(deactivated.body.item.isActive).toBe(false);
  });

  it("rejects an empty body with 400", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createItem(app, cookies);

    const res = await request(app).patch(`/items/${id}`).set("Cookie", cookies).send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 for an item belonging to a different business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createItem(app, cookies);

    const otherRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).patch(`/items/${id}`).set("Cookie", otherCookies).send({ unitPrice: 1 });
    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).patch("/items/x").send({ unitPrice: 1 });
    expect(res.status).toBe(401);
  });
});
