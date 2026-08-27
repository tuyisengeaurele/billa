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

async function registerAndGetCookies(app: ReturnType<typeof createApp>, email = "owner@example.com") {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: email, email }),
    businessName: "Kigali Traders",
  });
  return {
    cookies: res.headers["set-cookie"] as unknown as string[],
    userId: res.body.user.id as string,
  };
}

describe("GET /notifications", () => {
  it("lists only the caller's own notifications, newest first, with an unread count", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app, "owner@example.com");
    const { userId: otherUserId } = await registerAndGetCookies(app, "stranger@example.com");

    await prisma.notification.create({
      data: { userId, type: "MEMBER_JOINED", title: "Older", createdAt: new Date(Date.now() - 60000) },
    });
    await prisma.notification.create({ data: { userId, type: "PAYMENT_RECEIVED", title: "Newer" } });
    await prisma.notification.create({ data: { userId: otherUserId, type: "PAYMENT_RECEIVED", title: "Not yours" } });

    const res = await request(app).get("/notifications").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0].title).toBe("Newer");
    expect(res.body.results[1].title).toBe("Older");
    expect(res.body.unreadCount).toBe(2);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/notifications");
    expect(res.status).toBe(401);
  });
});

describe("POST /notifications/:id/read", () => {
  it("marks the caller's own notification as read", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app);
    const notification = await prisma.notification.create({
      data: { userId, type: "MEMBER_JOINED", title: "Test" },
    });

    const res = await request(app).post(`/notifications/${notification.id}/read`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    const updated = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(updated.readAt).not.toBeNull();
  });

  it("404s for another user's notification", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com");
    const { userId: strangerId } = await registerAndGetCookies(app, "stranger@example.com");
    const notification = await prisma.notification.create({
      data: { userId: strangerId, type: "MEMBER_JOINED", title: "Not yours" },
    });

    const res = await request(app).post(`/notifications/${notification.id}/read`).set("Cookie", ownerCookies);

    expect(res.status).toBe(404);
  });
});

describe("POST /notifications/mark-all-read", () => {
  it("marks every unread notification as read for the caller only", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app, "owner@example.com");
    const { userId: otherUserId } = await registerAndGetCookies(app, "stranger@example.com");
    await prisma.notification.create({ data: { userId, type: "MEMBER_JOINED", title: "A" } });
    await prisma.notification.create({ data: { userId, type: "PAYMENT_RECEIVED", title: "B" } });
    await prisma.notification.create({ data: { userId: otherUserId, type: "PAYMENT_RECEIVED", title: "C" } });

    const res = await request(app).post("/notifications/mark-all-read").set("Cookie", cookies);

    expect(res.status).toBe(200);
    const mine = await prisma.notification.findMany({ where: { userId } });
    expect(mine.every((n) => n.readAt !== null)).toBe(true);
    const theirs = await prisma.notification.findMany({ where: { userId: otherUserId } });
    expect(theirs[0].readAt).toBeNull();
  });
});
