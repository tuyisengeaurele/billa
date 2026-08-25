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
  return { cookies: res.headers["set-cookie"] as unknown as string[] };
}

describe("GET /admin/users/export.csv", () => {
  it("returns a CSV of users with a header row", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).get("/admin/users/export.csv").set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.text).toContain("Email,Admin,Suspended,Trial ends,Plan,Joined");
    expect(res.text).toContain("owner@example.com");
    expect(res.text).toContain("admin@example.com");
  });

  it("returns 403 for a non-admin", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).get("/admin/users/export.csv").set("Cookie", cookies);

    expect(res.status).toBe(403);
  });
});

describe("GET /admin/businesses/export.csv", () => {
  it("returns a CSV of businesses with a header row", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).get("/admin/businesses/export.csv").set("Cookie", adminCookies);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("Name,Owner,Members,Documents,Created");
    expect(res.text).toContain("Kigali Traders");
  });

  it("returns 403 for a non-admin", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).get("/admin/businesses/export.csv").set("Cookie", cookies);

    expect(res.status).toBe(403);
  });
});
