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

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[], name: string) {
  await request(app).post("/customers").set("Cookie", cookies).send({ name });
}

describe("GET /customers", () => {
  it("returns customers scoped to the authenticated business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await createCustomer(app, cookies, "Kigali Traders Ltd");
    await createCustomer(app, cookies, "Musanze Supplies");

    const res = await request(app).get("/customers").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(20);
  });

  it("filters by search", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await createCustomer(app, cookies, "Kigali Traders Ltd");
    await createCustomer(app, cookies, "Musanze Supplies");

    const res = await request(app).get("/customers?search=musanze").set("Cookie", cookies);

    expect(res.body.total).toBe(1);
    expect(res.body.results[0].name).toBe("Musanze Supplies");
  });

  it("hides inactive customers by default and shows them with includeInactive=true", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await createCustomer(app, cookies, "Kigali Traders Ltd");
    const list = await request(app).get("/customers").set("Cookie", cookies);
    const customerId = list.body.results[0].id;
    await request(app).patch(`/customers/${customerId}`).set("Cookie", cookies).send({ isActive: false });

    const hidden = await request(app).get("/customers").set("Cookie", cookies);
    expect(hidden.body.total).toBe(0);

    const shown = await request(app).get("/customers?includeInactive=true").set("Cookie", cookies);
    expect(shown.body.total).toBe(1);
  });

  it("paginates results", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    for (let i = 0; i < 3; i += 1) {
      await createCustomer(app, cookies, `Customer ${i}`);
    }

    const res = await request(app).get("/customers?page=1&pageSize=2").set("Cookie", cookies);

    expect(res.body.results).toHaveLength(2);
    expect(res.body.total).toBe(3);
  });

  it("does not return another business's customers", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await createCustomer(app, cookies, "Kigali Traders Ltd");

    const otherRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).get("/customers").set("Cookie", otherCookies);
    expect(res.body.total).toBe(0);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/customers");
    expect(res.status).toBe(401);
  });
});
