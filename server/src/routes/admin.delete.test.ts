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

describe("DELETE /admin/businesses/:id", () => {
  it("deletes a business and all of its data", async () => {
    const app = createApp();
    const { cookies: adminCookies, userId: adminId } = await registerAndGetCookies(app, "admin@example.com", true);
    const { businessId } = await registerAndGetCookies(app, "owner@example.com");
    const customer = await prisma.customer.create({ data: { businessId, name: "Musanze Supplies" } });
    await prisma.document.create({
      data: {
        businessId,
        customerId: customer.id,
        type: "INVOICE",
        template: "MINIMAL",
        number: "INV-0001",
        subtotal: 1000,
        taxTotal: 0,
        total: 1000,
        lines: { create: [{ description: "Item", quantity: 1, unitPrice: 1000, taxRate: 0, lineTotal: 1000, sortOrder: 0 }] },
      },
    });

    const res = await request(app).delete(`/admin/businesses/${businessId}`).set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    expect(await prisma.business.findUnique({ where: { id: businessId } })).toBeNull();
    expect(await prisma.customer.findMany({ where: { businessId } })).toHaveLength(0);
    expect(await prisma.document.findMany({ where: { businessId } })).toHaveLength(0);

    const rows = await prisma.adminAuditLogEntry.findMany({ where: { action: "BUSINESS_DELETED" } });
    expect(rows[0]).toMatchObject({ adminUserId: adminId, targetType: "Business", targetId: businessId });
  });

  it("returns 404 for an unknown business", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);

    const res = await request(app).delete("/admin/businesses/nonexistent").set("Cookie", adminCookies);

    expect(res.status).toBe(404);
  });

  it("returns 403 for a non-admin", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).delete(`/admin/businesses/${businessId}`).set("Cookie", cookies);

    expect(res.status).toBe(403);
  });
});

describe("DELETE /admin/users/:id", () => {
  it("deletes a user who is also a member of another business, cascading their own business and removing that membership", async () => {
    const app = createApp();
    const { cookies: adminCookies, userId: adminId } = await registerAndGetCookies(app, "admin@example.com", true);
    const { cookies: ownerCookies, businessId } = await registerAndGetCookies(app, "owner@example.com");
    const inviteRes = await request(app)
      .post("/business/invites")
      .set("Cookie", ownerCookies)
      .send({ email: "member@example.com" });
    const { cookies: memberCookies, userId: memberId, businessId: memberOwnBusinessId } = await registerAndGetCookies(
      app,
      "member@example.com",
    );
    await request(app).post(`/invites/${inviteRes.body.invite.token}/accept`).set("Cookie", memberCookies);

    const res = await request(app).delete(`/admin/users/${memberId}`).set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: memberId } })).toBeNull();
    expect(await prisma.business.findUnique({ where: { id: memberOwnBusinessId } })).toBeNull();
    expect(await prisma.businessMember.findMany({ where: { userId: memberId } })).toHaveLength(0);
    expect(await prisma.business.findUnique({ where: { id: businessId } })).not.toBeNull();

    const rows = await prisma.adminAuditLogEntry.findMany({ where: { action: "USER_DELETED" } });
    expect(rows[0]).toMatchObject({ adminUserId: adminId, targetType: "User", targetId: memberId });
  });

  it("cascades a user's owned business when deleting them", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    const { userId: ownerId, businessId } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).delete(`/admin/users/${ownerId}`).set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: ownerId } })).toBeNull();
    expect(await prisma.business.findUnique({ where: { id: businessId } })).toBeNull();
  });

  it("returns 400 when deleting yourself", async () => {
    const app = createApp();
    const { cookies: adminCookies, userId: adminId } = await registerAndGetCookies(app, "admin@example.com", true);

    const res = await request(app).delete(`/admin/users/${adminId}`).set("Cookie", adminCookies);

    expect(res.status).toBe(400);
  });

  it("returns 409 when the target has an admin action history", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    const { cookies: otherAdminCookies, userId: otherAdminId } = await registerAndGetCookies(
      app,
      "otheradmin@example.com",
      true,
    );
    const { userId: targetId } = await registerAndGetCookies(app, "target@example.com");
    await request(app).post(`/admin/users/${targetId}/toggle-admin`).set("Cookie", otherAdminCookies);

    const res = await request(app).delete(`/admin/users/${otherAdminId}`).set("Cookie", adminCookies);

    expect(res.status).toBe(409);
  });

  it("returns 404 for an unknown user", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);

    const res = await request(app).delete("/admin/users/nonexistent").set("Cookie", adminCookies);

    expect(res.status).toBe(404);
  });

  it("returns 403 for a non-admin", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app, "owner@example.com");
    const { userId: otherId } = await registerAndGetCookies(app, "other@example.com");

    const res = await request(app).delete(`/admin/users/${otherId}`).set("Cookie", cookies);

    expect(res.status).toBe(403);
    expect(userId).toBeTruthy();
  });
});
