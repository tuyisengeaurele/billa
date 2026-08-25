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
    await prisma.user.update({ where: { id: res.body.user.id }, data: { isAdmin: true } });
  }
  return {
    cookies: res.headers["set-cookie"] as unknown as string[],
    userId: res.body.user.id as string,
    businessId: res.body.business.id as string,
  };
}

describe("PATCH /admin/businesses/:id", () => {
  it("renames a business and logs the action", async () => {
    const app = createApp();
    const { cookies: adminCookies, userId: adminId } = await registerAndGetCookies(app, "admin@example.com", true);
    const { businessId } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app)
      .patch(`/admin/businesses/${businessId}`)
      .set("Cookie", adminCookies)
      .send({ name: "Renamed Traders" });

    expect(res.status).toBe(200);
    expect(res.body.business.name).toBe("Renamed Traders");
    const row = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(row.name).toBe("Renamed Traders");

    const rows = await prisma.adminAuditLogEntry.findMany({ where: { action: "BUSINESS_RENAMED" } });
    expect(rows[0]).toMatchObject({
      adminUserId: adminId,
      targetType: "Business",
      targetId: businessId,
      metadata: { from: "Kigali Traders", to: "Renamed Traders" },
    });
  });

  it("rejects an empty name", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    const { businessId } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app)
      .patch(`/admin/businesses/${businessId}`)
      .set("Cookie", adminCookies)
      .send({ name: "  " });

    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown business", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);

    const res = await request(app)
      .patch("/admin/businesses/nonexistent")
      .set("Cookie", adminCookies)
      .send({ name: "New Name" });

    expect(res.status).toBe(404);
  });

  it("returns 403 for a non-admin", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).patch(`/admin/businesses/${businessId}`).set("Cookie", cookies).send({ name: "X" });

    expect(res.status).toBe(403);
  });
});
