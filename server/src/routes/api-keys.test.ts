import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";
import { prisma } from "../lib/prisma.js";

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
  return res.headers["set-cookie"] as unknown as string[];
}

describe("API key management", () => {
  it("requires a session", async () => {
    const app = createApp();
    expect((await request(app).get("/api-keys")).status).toBe(401);
    expect((await request(app).post("/api-keys").send({ name: "x" })).status).toBe(401);
    expect((await request(app).delete("/api-keys/abc")).status).toBe(401);
  });

  it("creates a key, showing the full key once and never storing it", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).post("/api-keys").set("Cookie", cookies).send({ name: "Accounting sync" });

    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^bla_live_/);
    expect(res.body.apiKey).toMatchObject({ name: "Accounting sync", revokedAt: null, lastUsedAt: null });
    expect(res.body.apiKey).not.toHaveProperty("keyHash");
    const stored = await prisma.apiKey.findFirstOrThrow();
    expect(stored.keyHash).not.toContain(res.body.key);
    expect(res.body.key.startsWith(stored.keyPrefix)).toBe(true);
  });

  it("lists keys by their prefix, without the key or hash", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const created = await request(app).post("/api-keys").set("Cookie", cookies).send({ name: "Accounting sync" });

    const res = await request(app).get("/api-keys").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0]).toMatchObject({ name: "Accounting sync", keyPrefix: created.body.apiKey.keyPrefix });
    expect(JSON.stringify(res.body)).not.toContain(created.body.key);
    expect(res.body.results[0]).not.toHaveProperty("keyHash");
  });

  it("rejects a missing name", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).post("/api-keys").set("Cookie", cookies).send({ name: "" });

    expect(res.status).toBe(400);
  });

  it("revokes a key", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const created = await request(app).post("/api-keys").set("Cookie", cookies).send({ name: "Old key" });

    const res = await request(app).delete(`/api-keys/${created.body.apiKey.id}`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    const stored = await prisma.apiKey.findUniqueOrThrow({ where: { id: created.body.apiKey.id } });
    expect(stored.revokedAt).not.toBeNull();
  });

  it("does not let another business see or revoke a key", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const otherCookies = await registerAndGetCookies(app, "other@example.com");
    const created = await request(app).post("/api-keys").set("Cookie", cookies).send({ name: "Mine" });

    const list = await request(app).get("/api-keys").set("Cookie", otherCookies);
    const revoke = await request(app).delete(`/api-keys/${created.body.apiKey.id}`).set("Cookie", otherCookies);

    expect(list.body.results).toHaveLength(0);
    expect(revoke.status).toBe(404);
  });

  it("stops at ten active keys, and a revoked key frees a slot", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post("/api-keys").set("Cookie", cookies).send({ name: `Key ${i}` });
      ids.push(res.body.apiKey.id);
    }

    const blocked = await request(app).post("/api-keys").set("Cookie", cookies).send({ name: "One too many" });
    await request(app).delete(`/api-keys/${ids[0]}`).set("Cookie", cookies);
    const allowed = await request(app).post("/api-keys").set("Cookie", cookies).send({ name: "Replacement" });

    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe("too_many_api_keys");
    expect(allowed.status).toBe(201);
  });

  it("is limited to the business owner", async () => {
    const app = createApp();
    const ownerCookies = await registerAndGetCookies(app);
    const owner = await prisma.user.findFirstOrThrow({ where: { email: "owner@example.com" } });
    const business = await prisma.business.findFirstOrThrow({ where: { ownerId: owner.id } });
    const memberSession = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "member@example.com", email: "member@example.com" }),
      businessName: "Member Co",
    });
    const member = await prisma.user.findFirstOrThrow({ where: { email: "member@example.com" } });
    await prisma.businessMember.create({ data: { businessId: business.id, userId: member.id, role: "MEMBER" } });
    const switched = await request(app)
      .post("/auth/switch-business")
      .set("Cookie", memberSession.headers["set-cookie"] as unknown as string[])
      .send({ businessId: business.id });
    const memberCookies = switched.headers["set-cookie"] as unknown as string[];

    const res = await request(app).post("/api-keys").set("Cookie", memberCookies).send({ name: "Sneaky" });

    expect(ownerCookies).toBeTruthy();
    expect(res.status).toBe(403);
  });
});
