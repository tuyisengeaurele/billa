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

async function registerAndGetCookies(app: ReturnType<typeof createApp>, email: string, isAdmin = false) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: email, email }),
    businessName: "Kigali Traders",
  });
  if (isAdmin) {
    await prisma.user.update({ where: { id: res.body.user.id }, data: { isAdmin: true, totpEnabled: true } });
  }
  return {
    cookies: res.headers["set-cookie"] as unknown as string[],
    userId: res.body.user.id as string,
    businessId: res.body.business.id as string,
  };
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function createDocument(
  businessId: string,
  customerId: string,
  number: string,
  createdAt: Date,
  status: "DRAFT" | "FINALIZED" = "DRAFT",
) {
  return prisma.document.create({
    data: {
      businessId,
      customerId,
      type: "INVOICE",
      template: "MINIMAL",
      number,
      subtotal: 1000,
      taxTotal: 0,
      total: 1000,
      createdAt,
      status,
    },
  });
}

describe("GET /admin/metrics", () => {
  it("reflects seeded data correctly", async () => {
    const app = createApp();
    const { cookies: adminCookies, businessId } = await registerAndGetCookies(app, "admin@example.com", true);

    const { userId: paying1 } = await registerAndGetCookies(app, "paying1@example.com");
    await prisma.user.update({ where: { id: paying1 }, data: { plan: "MONTHLY" } });

    const { userId: recentSignup } = await registerAndGetCookies(app, "recent@example.com");
    await prisma.user.update({ where: { id: recentSignup }, data: { createdAt: daysAgo(3) } });

    const { userId: midSignup } = await registerAndGetCookies(app, "mid@example.com");
    await prisma.user.update({ where: { id: midSignup }, data: { createdAt: daysAgo(15) } });

    const { userId: oldSignup } = await registerAndGetCookies(app, "old@example.com");
    await prisma.user.update({ where: { id: oldSignup }, data: { createdAt: daysAgo(40) } });

    const customer = await prisma.customer.create({ data: { businessId, name: "Test Customer" } });
    await createDocument(businessId, customer.id, "INV-0001", daysAgo(2));
    await createDocument(businessId, customer.id, "INV-0002", daysAgo(15));
    await createDocument(businessId, customer.id, "INV-0003", daysAgo(40));

    const res = await request(app).get("/admin/metrics").set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    expect(res.body.totalUsers).toBe(5);
    expect(res.body.totalBusinesses).toBe(5);
    expect(res.body.payingAccounts).toBe(1);
    expect(res.body.activeTrials).toBe(4);
    expect(res.body.signups7d).toBe(3);
    expect(res.body.signups30d).toBe(4);
    expect(res.body.documents7d).toBe(1);
    expect(res.body.documents30d).toBe(2);
    expect(Array.isArray(res.body.dailySignups30d)).toBe(true);
    const totalFromSparkline = res.body.dailySignups30d.reduce(
      (sum: number, row: { count: number }) => sum + row.count,
      0,
    );
    expect(totalFromSparkline).toBe(4);

    expect(Array.isArray(res.body.dailyDocuments30d)).toBe(true);
    const totalDocuments = res.body.dailyDocuments30d.reduce(
      (sum: number, row: { count: number }) => sum + row.count,
      0,
    );
    expect(totalDocuments).toBe(2);

    expect(res.body.planDistribution).toEqual(
      expect.arrayContaining([
        { plan: "NONE", count: 4 },
        { plan: "MONTHLY", count: 1 },
      ]),
    );
  });

  it("reports activation rate as the share of businesses that have finalized at least one document", async () => {
    const app = createApp();
    const { cookies: adminCookies, businessId: activatedBusinessId } = await registerAndGetCookies(
      app,
      "admin@example.com",
      true,
    );
    const { businessId: draftOnlyBusinessId } = await registerAndGetCookies(app, "draft-only@example.com");

    const customer1 = await prisma.customer.create({ data: { businessId: activatedBusinessId, name: "Customer A" } });
    await createDocument(activatedBusinessId, customer1.id, "INV-0001", daysAgo(1), "FINALIZED");

    const customer2 = await prisma.customer.create({ data: { businessId: draftOnlyBusinessId, name: "Customer B" } });
    await createDocument(draftOnlyBusinessId, customer2.id, "INV-0001", daysAgo(1), "DRAFT");

    const res = await request(app).get("/admin/metrics").set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    expect(res.body.activation).toEqual({
      activatedBusinesses: 1,
      totalBusinesses: 2,
      rate: 0.5,
    });
  });

  it("returns weekly retention cohorts grouped by business signup week", async () => {
    const app = createApp();
    const { cookies: adminCookies, businessId, userId } = await registerAndGetCookies(app, "admin@example.com", true);
    await prisma.business.update({ where: { id: businessId }, data: { createdAt: daysAgo(3) } });
    await prisma.user.update({ where: { id: userId }, data: { createdAt: daysAgo(3) } });

    const customer = await prisma.customer.create({ data: { businessId, name: "Customer A" } });
    await createDocument(businessId, customer.id, "INV-0001", daysAgo(2));

    const res = await request(app).get("/admin/metrics").set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.retentionCohorts)).toBe(true);
    const totalCohortBusinesses = res.body.retentionCohorts.reduce(
      (sum: number, cohort: { cohortSize: number }) => sum + cohort.cohortSize,
      0,
    );
    expect(totalCohortBusinesses).toBe(1);
  });

  it("returns 403 for a non-admin", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).get("/admin/metrics").set("Cookie", cookies);

    expect(res.status).toBe(403);
  });
});
