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
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return {
    cookies: res.headers["set-cookie"] as unknown as string[],
    businessId: res.body.business.id as string,
  };
}

describe("customer routes log activity", () => {
  it("logs CUSTOMER_CREATED", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app);

    await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });

    const rows = await prisma.activityLogEntry.findMany({ where: { businessId, action: "CUSTOMER_CREATED" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ name: "Acme Ltd" });
  });

  it("logs CUSTOMER_DEACTIVATED when isActive is set to false", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app);
    const createRes = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });

    await request(app)
      .patch(`/customers/${createRes.body.customer.id}`)
      .set("Cookie", cookies)
      .send({ name: "Acme Ltd", isActive: false });

    const rows = await prisma.activityLogEntry.findMany({ where: { businessId, action: "CUSTOMER_DEACTIVATED" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ name: "Acme Ltd" });
  });

  it("does not log a deactivation for an unrelated field update", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app);
    const createRes = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });

    await request(app)
      .patch(`/customers/${createRes.body.customer.id}`)
      .set("Cookie", cookies)
      .send({ name: "Acme Ltd", phone: "0788000000" });

    const rows = await prisma.activityLogEntry.findMany({ where: { businessId, action: "CUSTOMER_DEACTIVATED" } });
    expect(rows).toHaveLength(0);
  });
});
