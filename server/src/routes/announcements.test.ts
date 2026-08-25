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

describe("GET /announcements/active", () => {
  it("returns null when there's no active announcement", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).get("/announcements/active").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.announcement).toBeNull();
  });

  it("returns the active announcement for any authenticated user", async () => {
    const app = createApp();
    const { cookies: adminCookies } = await registerAndGetCookies(app, "admin@example.com", true);
    await request(app).post("/admin/announcements").set("Cookie", adminCookies).send({ message: "Heads up!" });
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).get("/announcements/active").set("Cookie", ownerCookies);

    expect(res.status).toBe(200);
    expect(res.body.announcement).toMatchObject({ message: "Heads up!" });
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/announcements/active");
    expect(res.status).toBe(401);
  });
});
