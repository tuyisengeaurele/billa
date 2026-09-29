import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";
import { prisma } from "../lib/prisma.js";
import { decryptWithKey } from "../lib/encryption.js";
import { setDeliveryScheduler, WEBHOOK_SECRET_KEY_ENV } from "../lib/webhooks/dispatch.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
  process.env[WEBHOOK_SECRET_KEY_ENV] ??= Buffer.alloc(32, 9).toString("base64");
});

let scheduled: string[] = [];
beforeEach(async () => {
  await resetDb();
  scheduled = [];
  setDeliveryScheduler((id) => scheduled.push(id));
});

async function registerAndGetCookies(app: ReturnType<typeof createApp>, email = "owner@example.com") {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: email, email }),
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

const VALID = { url: "https://hooks.example.com/billa", events: ["payment.received"] };

describe("webhook endpoints", () => {
  it("requires a session", async () => {
    const app = createApp();
    expect((await request(app).get("/webhooks")).status).toBe(401);
    expect((await request(app).post("/webhooks").send(VALID)).status).toBe(401);
  });

  it("creates an endpoint, showing the signing secret once and storing it encrypted", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).post("/webhooks").set("Cookie", cookies).send(VALID);

    expect(res.status).toBe(201);
    expect(res.body.secret).toMatch(/^whsec_/);
    expect(res.body.endpoint).toMatchObject({ url: VALID.url, events: VALID.events, active: true });
    expect(res.body.endpoint).not.toHaveProperty("secretEnc");
    const stored = await prisma.webhookEndpoint.findFirstOrThrow();
    expect(stored.secretEnc).not.toContain(res.body.secret);
    expect(decryptWithKey(stored.secretEnc, WEBHOOK_SECRET_KEY_ENV)).toBe(res.body.secret);
  });

  it("lists endpoints without their secrets", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const created = await request(app).post("/webhooks").set("Cookie", cookies).send(VALID);

    const res = await request(app).get("/webhooks").set("Cookie", cookies);

    expect(res.body.results).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain(created.body.secret);
  });

  it("refuses an address on a private network", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/webhooks")
      .set("Cookie", cookies)
      .send({ url: "https://169.254.169.254/latest", events: ["payment.received"] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_url");
    expect(await prisma.webhookEndpoint.count()).toBe(0);
  });

  it("refuses an unknown event and an empty event list", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    expect((await request(app).post("/webhooks").set("Cookie", cookies).send({ ...VALID, events: ["x.y"] })).status).toBe(400);
    expect((await request(app).post("/webhooks").set("Cookie", cookies).send({ ...VALID, events: [] })).status).toBe(400);
  });

  it("stops at five endpoints", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    for (let i = 0; i < 5; i++) {
      await request(app).post("/webhooks").set("Cookie", cookies).send({ ...VALID, url: `https://hooks.example.com/${i}` });
    }

    const res = await request(app).post("/webhooks").set("Cookie", cookies).send(VALID);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("too_many_webhooks");
  });

  it("switches an endpoint off and on", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const created = await request(app).post("/webhooks").set("Cookie", cookies).send(VALID);
    const id = created.body.endpoint.id as string;

    const off = await request(app).patch(`/webhooks/${id}`).set("Cookie", cookies).send({ active: false });

    expect(off.body.endpoint.active).toBe(false);
    expect((await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id } })).active).toBe(false);
  });

  it("deletes an endpoint together with its delivery history", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const created = await request(app).post("/webhooks").set("Cookie", cookies).send(VALID);
    const id = created.body.endpoint.id as string;
    await prisma.webhookDelivery.create({ data: { endpointId: id, event: "payment.received", payload: {} } });

    const res = await request(app).delete(`/webhooks/${id}`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(await prisma.webhookEndpoint.count()).toBe(0);
    expect(await prisma.webhookDelivery.count()).toBe(0);
  });

  it("sends a test event", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const created = await request(app).post("/webhooks").set("Cookie", cookies).send(VALID);

    const res = await request(app).post(`/webhooks/${created.body.endpoint.id}/test`).set("Cookie", cookies);

    expect(res.status).toBe(202);
    const delivery = await prisma.webhookDelivery.findFirstOrThrow();
    expect(delivery.event).toBe("webhook.test");
    expect(scheduled).toEqual([delivery.id]);
  });

  it("shows recent deliveries with their outcome", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const created = await request(app).post("/webhooks").set("Cookie", cookies).send(VALID);
    const id = created.body.endpoint.id as string;
    await prisma.webhookDelivery.create({
      data: { endpointId: id, event: "payment.received", payload: { secret: "hidden" }, status: "FAILED", attempts: 5, lastStatusCode: 500, lastError: "The receiver answered 500" },
    });

    const res = await request(app).get(`/webhooks/${id}/deliveries`).set("Cookie", cookies);

    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0]).toMatchObject({ event: "payment.received", status: "FAILED", attempts: 5, lastStatusCode: 500 });
    expect(res.body.results[0]).not.toHaveProperty("payload");
  });

  it("cannot see or change another business's endpoints", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const otherCookies = await registerAndGetCookies(app, "other@example.com");
    const created = await request(app).post("/webhooks").set("Cookie", cookies).send(VALID);
    const id = created.body.endpoint.id as string;

    expect((await request(app).get("/webhooks").set("Cookie", otherCookies)).body.results).toHaveLength(0);
    expect((await request(app).delete(`/webhooks/${id}`).set("Cookie", otherCookies)).status).toBe(404);
    expect((await request(app).patch(`/webhooks/${id}`).set("Cookie", otherCookies).send({ active: false })).status).toBe(404);
    expect((await request(app).post(`/webhooks/${id}/test`).set("Cookie", otherCookies)).status).toBe(404);
    expect((await request(app).get(`/webhooks/${id}/deliveries`).set("Cookie", otherCookies)).status).toBe(404);
  });
});
