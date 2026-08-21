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

async function createItem(app: ReturnType<typeof createApp>, cookies: string[], description: string) {
  await request(app).post("/items").set("Cookie", cookies).send({ description, unitPrice: 1000, unit: "piece" });
}

describe("GET /items", () => {
  it("returns items scoped to the authenticated business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await createItem(app, cookies, "Printing service");
    await createItem(app, cookies, "Delivery box");

    const res = await request(app).get("/items").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.results).toHaveLength(2);
  });

  it("filters by search", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await createItem(app, cookies, "Printing service");
    await createItem(app, cookies, "Delivery box");

    const res = await request(app).get("/items?search=box").set("Cookie", cookies);

    expect(res.body.total).toBe(1);
    expect(res.body.results[0].description).toBe("Delivery box");
  });

  it("hides inactive items by default and shows them with includeInactive=true", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await createItem(app, cookies, "Printing service");
    const list = await request(app).get("/items").set("Cookie", cookies);
    const itemId = list.body.results[0].id;
    await request(app).patch(`/items/${itemId}`).set("Cookie", cookies).send({ isActive: false });

    const hidden = await request(app).get("/items").set("Cookie", cookies);
    expect(hidden.body.total).toBe(0);

    const shown = await request(app).get("/items?includeInactive=true").set("Cookie", cookies);
    expect(shown.body.total).toBe(1);
  });

  it("does not return another business's items", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await createItem(app, cookies, "Printing service");

    const otherRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).get("/items").set("Cookie", otherCookies);
    expect(res.body.total).toBe(0);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/items");
    expect(res.status).toBe(401);
  });
});
