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
  return { cookies: res.headers["set-cookie"] as unknown as string[], userId: res.body.user.id as string };
}

describe("POST /admin/announcements", () => {
  it("creates an announcement and logs the action", async () => {
    const app = createApp();
    const { cookies: adminCookies, userId: adminId } = await registerAndGetCookies(app, "admin@example.com", true);

    const res = await request(app)
      .post("/admin/announcements")
      .set("Cookie", adminCookies)
      .send({ message: "Scheduled maintenance tonight at 10pm." });

    expect(res.status).toBe(201);
    expect(res.body.announcement).toMatchObject({ message: "Scheduled maintenance tonight at 10pm.", active: true });

    const rows = await prisma.adminAuditLogEntry.findMany({ where: { action: "ANNOUNCEMENT_POSTED" } });
    expect(rows[0].adminUserId).toBe(adminId);
  });

  it("deactivates any previously active announcement when a new one is posted", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    const first = await request(app).post("/admin/announcements").set("Cookie", adminCookies).send({ message: "First" });

    await request(app).post("/admin/announcements").set("Cookie", adminCookies).send({ message: "Second" });

    const stale = await prisma.announcement.findUniqueOrThrow({ where: { id: first.body.announcement.id } });
    expect(stale.active).toBe(false);
  });

  it("rejects an empty message", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);

    const res = await request(app).post("/admin/announcements").set("Cookie", adminCookies).send({ message: "  " });

    expect(res.status).toBe(400);
  });

  it("returns 403 for a non-admin", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).post("/admin/announcements").set("Cookie", cookies).send({ message: "Hi" });

    expect(res.status).toBe(403);
  });
});

describe("GET /admin/announcements", () => {
  it("lists announcements newest first", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    await request(app).post("/admin/announcements").set("Cookie", adminCookies).send({ message: "First" });
    await request(app).post("/admin/announcements").set("Cookie", adminCookies).send({ message: "Second" });

    const res = await request(app).get("/admin/announcements").set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    expect(res.body.results.map((a: { message: string }) => a.message)).toEqual(["Second", "First"]);
  });
});

describe("POST /admin/announcements/:id/deactivate", () => {
  it("deactivates an announcement and logs the action", async () => {
    const app = createApp();
    const { cookies: adminCookies, userId: adminId } = await registerAndGetCookies(app, "admin@example.com", true);
    const created = await request(app)
      .post("/admin/announcements")
      .set("Cookie", adminCookies)
      .send({ message: "Hi" });

    const res = await request(app)
      .post(`/admin/announcements/${created.body.announcement.id}/deactivate`)
      .set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    const row = await prisma.announcement.findUniqueOrThrow({ where: { id: created.body.announcement.id } });
    expect(row.active).toBe(false);

    const logRows = await prisma.adminAuditLogEntry.findMany({ where: { action: "ANNOUNCEMENT_DEACTIVATED" } });
    expect(logRows[0].adminUserId).toBe(adminId);
  });

  it("returns 404 for an unknown announcement", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);

    const res = await request(app).post("/admin/announcements/nonexistent/deactivate").set("Cookie", adminCookies);

    expect(res.status).toBe(404);
  });
});
