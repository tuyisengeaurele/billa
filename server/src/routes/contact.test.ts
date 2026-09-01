import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";
import { prisma } from "../lib/prisma.js";
import * as resendModule from "../lib/resend.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

async function registerAndGetCookies(app: ReturnType<typeof createApp>, email: string) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: email, email }),
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

describe("POST /contact", () => {
  it("stores a valid message without requiring a session", async () => {
    const app = createApp();

    const res = await request(app)
      .post("/contact")
      .send({ name: "Aline", email: "aline@example.com", message: "I'd like help setting up my templates." });

    expect(res.status).toBe(201);

    const stored = await prisma.contactMessage.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      name: "Aline",
      email: "aline@example.com",
      message: "I'd like help setting up my templates.",
    });
  });

  it("returns 400 for an invalid submission", async () => {
    const app = createApp();

    const res = await request(app).post("/contact").send({ name: "", email: "not-an-email", message: "hi" });

    expect(res.status).toBe(400);

    const stored = await prisma.contactMessage.findMany();
    expect(stored).toHaveLength(0);
  });

  it("emails the admin notification address when one is configured", async () => {
    process.env.CONTACT_NOTIFICATION_EMAIL = "notify@example.com";
    const sendSpy = vi.spyOn(resendModule, "sendEmail").mockResolvedValue();
    const app = createApp();

    const res = await request(app)
      .post("/contact")
      .send({ name: "Aline", email: "aline@example.com", message: "I'd like help setting up my templates." });

    expect(res.status).toBe(201);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: "notify@example.com", subject: expect.stringContaining("Aline") }),
    );

    delete process.env.CONTACT_NOTIFICATION_EMAIL;
    sendSpy.mockRestore();
  });

  it("still stores the message even if the notification email fails", async () => {
    process.env.CONTACT_NOTIFICATION_EMAIL = "notify@example.com";
    vi.spyOn(resendModule, "sendEmail").mockRejectedValue(new Error("provider down"));
    const app = createApp();

    const res = await request(app)
      .post("/contact")
      .send({ name: "Aline", email: "aline@example.com", message: "I'd like help setting up my templates." });

    expect(res.status).toBe(201);
    const stored = await prisma.contactMessage.findMany();
    expect(stored).toHaveLength(1);

    delete process.env.CONTACT_NOTIFICATION_EMAIL;
    vi.restoreAllMocks();
  });

  it("notifies every admin user in-app", async () => {
    const app = createApp();
    await registerAndGetCookies(app, "admin@example.com");
    await prisma.user.update({ where: { email: "admin@example.com" }, data: { isAdmin: true } });

    const res = await request(app)
      .post("/contact")
      .send({ name: "Aline", email: "aline@example.com", message: "I'd like help setting up my templates." });

    expect(res.status).toBe(201);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    const notifications = await prisma.notification.findMany({ where: { userId: admin.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ type: "CONTACT_MESSAGE_RECEIVED", title: "New message from Aline" });
  });
});

describe("GET /contact", () => {
  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/contact");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a signed-in user who isn't an admin", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).get("/contact").set("Cookie", cookies);

    expect(res.status).toBe(403);
  });

  it("lists messages for an admin user", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app, "admin@example.com");
    await prisma.user.update({ where: { email: "admin@example.com" }, data: { isAdmin: true } });
    await prisma.contactMessage.create({
      data: { name: "Aline", email: "aline@example.com", message: "Need help with templates please." },
    });

    const res = await request(app).get("/contact").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.results[0]).toMatchObject({ name: "Aline", email: "aline@example.com" });
  });
});

describe("DELETE /contact/:id", () => {
  it("returns 401 without a session", async () => {
    const res = await request(createApp()).delete("/contact/some-id");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a signed-in user who isn't an admin", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app, "owner@example.com");

    const res = await request(app).delete("/contact/some-id").set("Cookie", cookies);

    expect(res.status).toBe(403);
  });

  it("deletes a message for an admin user", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app, "admin@example.com");
    await prisma.user.update({ where: { email: "admin@example.com" }, data: { isAdmin: true } });
    const message = await prisma.contactMessage.create({
      data: { name: "Aline", email: "aline@example.com", message: "Need help with templates please." },
    });

    const res = await request(app).delete(`/contact/${message.id}`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    const stored = await prisma.contactMessage.findMany();
    expect(stored).toHaveLength(0);
  });

  it("returns 404 for an unknown message", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app, "admin@example.com");
    await prisma.user.update({ where: { email: "admin@example.com" }, data: { isAdmin: true } });

    const res = await request(app).delete("/contact/nonexistent").set("Cookie", cookies);

    expect(res.status).toBe(404);
  });
});
