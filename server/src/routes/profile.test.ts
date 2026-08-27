import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
  process.env.UPLOADS_DIR ??= "./uploads-test";
});

beforeEach(resetDb);

const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

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

describe("PATCH /profile", () => {
  it("updates the caller's own name", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app);

    const res = await request(app).patch("/profile").set("Cookie", cookies).send({ name: "Ange Aurele" });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Ange Aurele");
  });

  it("rejects an empty name", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app);

    const res = await request(app).patch("/profile").set("Cookie", cookies).send({ name: "  " });

    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).patch("/profile").send({ name: "Someone" });
    expect(res.status).toBe(401);
  });
});

describe("POST /profile/avatar", () => {
  it("accepts a valid PNG and saves it as the caller's avatar", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app);

    const res = await request(app).post("/profile/avatar").set("Cookie", cookies).attach("avatar", MINIMAL_PNG, "me.png");

    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/uploads\/[\w-]+\/[\w-]+\.png$/);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.avatarUrl).toBe(res.body.url);
  });

  it("rejects a non-image file even with an image extension", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/profile/avatar")
      .set("Cookie", cookies)
      .attach("avatar", Buffer.from("not an image"), "fake.png");

    expect(res.status).toBe(400);
  });

  it("rejects a missing file", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app);

    const res = await request(app).post("/profile/avatar").set("Cookie", cookies);

    expect(res.status).toBe(400);
  });
});

describe("DELETE /profile/avatar", () => {
  it("clears the caller's avatar", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app);
    await prisma.user.update({ where: { id: userId }, data: { avatarUrl: "/uploads/x/y.png" } });

    const res = await request(app).delete("/profile/avatar").set("Cookie", cookies);

    expect(res.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.avatarUrl).toBeNull();
  });
});

describe("GET /profile/sessions", () => {
  it("lists only the caller's own sessions and marks the current one", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com");
    const { cookies: otherCookies } = await registerAndGetCookies(app, "stranger@example.com");
    void otherCookies;

    const res = await request(app).get("/profile/sessions").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].isCurrent).toBe(true);
  });
});

describe("POST /profile/sessions/:id/revoke", () => {
  it("revokes one of the caller's own sessions", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app);
    const listRes = await request(app).get("/profile/sessions").set("Cookie", cookies);
    const sessionId = listRes.body.results[0].id;

    const res = await request(app).post(`/profile/sessions/${sessionId}/revoke`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    const session = await prisma.refreshToken.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.revokedAt).not.toBeNull();
  });

  it("404s for another user's session", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com");
    const { cookies: strangerCookies } = await registerAndGetCookies(app, "stranger@example.com");
    const strangerSessions = await request(app).get("/profile/sessions").set("Cookie", strangerCookies);
    const strangerSessionId = strangerSessions.body.results[0].id;

    const res = await request(app).post(`/profile/sessions/${strangerSessionId}/revoke`).set("Cookie", ownerCookies);

    expect(res.status).toBe(404);
  });
});

describe("POST /profile/sessions/revoke-others", () => {
  it("revokes every session except the one making the request", async () => {
    const app = createApp();
    const first = await registerAndGetCookies(app, "owner@example.com");
    const secondLogin = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    });
    const secondCookies = secondLogin.headers["set-cookie"] as unknown as string[];

    await request(app).post("/profile/sessions/revoke-others").set("Cookie", secondCookies);

    const res = await request(app).get("/profile/sessions").set("Cookie", secondCookies);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].isCurrent).toBe(true);

    const refreshWithRevokedSession = await request(app).post("/auth/refresh").set("Cookie", first.cookies);
    expect(refreshWithRevokedSession.status).toBe(401);
  });
});
