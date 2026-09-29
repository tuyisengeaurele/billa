import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../prisma.js";
import { resetDb } from "../../test/db.js";
import { encryptWithKey, decryptWithKey } from "../encryption.js";
import { verifyWebhookSignature } from "./signature.js";
import {
  attemptDelivery,
  emitWebhookEvent,
  retryDueWebhookDeliveries,
  setDeliveryScheduler,
  WEBHOOK_SECRET_KEY_ENV,
} from "./dispatch.js";

beforeAll(() => {
  process.env[WEBHOOK_SECRET_KEY_ENV] ??= Buffer.alloc(32, 9).toString("base64");
});

beforeEach(async () => {
  await resetDb();
  setDeliveryScheduler(() => {});
  vi.restoreAllMocks();
});

const PUBLIC = async () => ["93.184.216.34"];

async function setUpEndpoint(overrides: { events?: string[]; active?: boolean; url?: string } = {}) {
  const user = await prisma.user.create({
    data: { email: "owner@example.com", firebaseUid: "uid-1", trialEndsAt: new Date(Date.now() + 1e9) },
  });
  const business = await prisma.business.create({ data: { ownerId: user.id, name: "Kigali Traders" } });
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      businessId: business.id,
      url: overrides.url ?? "https://hooks.example.com/billa",
      secretEnc: encryptWithKey("whsec_test", WEBHOOK_SECRET_KEY_ENV),
      events: overrides.events ?? ["payment.received"],
      active: overrides.active ?? true,
    },
  });
  return { business, endpoint };
}

function okResponse(status = 200) {
  return new Response(status === 204 ? null : "ok", { status });
}

describe("emitWebhookEvent", () => {
  it("records a pending delivery for each active endpoint subscribed to the event", async () => {
    const { business, endpoint } = await setUpEndpoint({ events: ["payment.received"] });
    await prisma.webhookEndpoint.create({
      data: { businessId: business.id, url: "https://b.example.com", secretEnc: "x", events: ["document.finalized"] },
    });
    await prisma.webhookEndpoint.create({
      data: { businessId: business.id, url: "https://c.example.com", secretEnc: "x", events: ["payment.received"], active: false },
    });

    await emitWebhookEvent(business.id, "payment.received", { amount: 5000 });

    const deliveries = await prisma.webhookDelivery.findMany();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ endpointId: endpoint.id, event: "payment.received", status: "PENDING" });
  });

  it("hands each new delivery to the scheduler to send", async () => {
    const { business } = await setUpEndpoint();
    const scheduled: string[] = [];
    setDeliveryScheduler((id) => scheduled.push(id));

    await emitWebhookEvent(business.id, "payment.received", { amount: 5000 });

    const delivery = await prisma.webhookDelivery.findFirstOrThrow();
    expect(scheduled).toEqual([delivery.id]);
  });

  it("does nothing when no endpoint listens for the event", async () => {
    const { business } = await setUpEndpoint({ events: ["document.finalized"] });

    await emitWebhookEvent(business.id, "payment.received", { amount: 1 });

    expect(await prisma.webhookDelivery.count()).toBe(0);
  });

  it("never throws into the request that caused the event", async () => {
    await expect(emitWebhookEvent("missing-business", "payment.received", {})).resolves.toBeUndefined();
  });
});

describe("attemptDelivery", () => {
  it("posts the signed event and marks the delivery succeeded", async () => {
    const { business } = await setUpEndpoint();
    await emitWebhookEvent(business.id, "payment.received", { amount: 5000 });
    const delivery = await prisma.webhookDelivery.findFirstOrThrow();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(okResponse(204));

    await attemptDelivery(delivery.id, { resolveAddresses: PUBLIC });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://hooks.example.com/billa");
    const body = String((init as RequestInit).body);
    expect(JSON.parse(body)).toMatchObject({ id: delivery.id, event: "payment.received", data: { amount: 5000 } });
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(verifyWebhookSignature("whsec_test", body, headers["Billa-Signature"]!)).toBe(true);
    expect(headers["Content-Type"]).toBe("application/json");
    expect((init as RequestInit).redirect).toBe("manual");

    const stored = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(stored).toMatchObject({ status: "SUCCEEDED", attempts: 1, lastStatusCode: 204 });
    expect(stored.deliveredAt).not.toBeNull();
    expect(stored.nextAttemptAt).toBeNull();
  });

  it("schedules a retry when the receiver answers with an error", async () => {
    const { business } = await setUpEndpoint();
    await emitWebhookEvent(business.id, "payment.received", {});
    const delivery = await prisma.webhookDelivery.findFirstOrThrow();
    vi.spyOn(global, "fetch").mockResolvedValue(okResponse(500));

    await attemptDelivery(delivery.id, { resolveAddresses: PUBLIC });

    const stored = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(stored).toMatchObject({ status: "PENDING", attempts: 1, lastStatusCode: 500 });
    expect(stored.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("treats a redirect as a failure instead of following it", async () => {
    const { business } = await setUpEndpoint();
    await emitWebhookEvent(business.id, "payment.received", {});
    const delivery = await prisma.webhookDelivery.findFirstOrThrow();
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/" } }));

    await attemptDelivery(delivery.id, { resolveAddresses: PUBLIC });

    const stored = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(stored.status).toBe("PENDING");
    expect(stored.lastStatusCode).toBe(302);
  });

  it("records a network error and retries", async () => {
    const { business } = await setUpEndpoint();
    await emitWebhookEvent(business.id, "payment.received", {});
    const delivery = await prisma.webhookDelivery.findFirstOrThrow();
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("connect ECONNREFUSED"));

    await attemptDelivery(delivery.id, { resolveAddresses: PUBLIC });

    const stored = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(stored.status).toBe("PENDING");
    expect(stored.lastError).toContain("ECONNREFUSED");
  });

  it("gives up after five attempts", async () => {
    const { business } = await setUpEndpoint();
    await emitWebhookEvent(business.id, "payment.received", {});
    const delivery = await prisma.webhookDelivery.findFirstOrThrow();
    await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { attempts: 4 } });
    vi.spyOn(global, "fetch").mockResolvedValue(okResponse(500));

    await attemptDelivery(delivery.id, { resolveAddresses: PUBLIC });

    const stored = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(stored).toMatchObject({ status: "FAILED", attempts: 5, nextAttemptAt: null });
  });

  it("never connects to an address that resolves to a private network", async () => {
    const { business } = await setUpEndpoint();
    await emitWebhookEvent(business.id, "payment.received", {});
    const delivery = await prisma.webhookDelivery.findFirstOrThrow();
    const fetchSpy = vi.spyOn(global, "fetch");

    await attemptDelivery(delivery.id, { resolveAddresses: async () => ["10.0.0.7"] });

    expect(fetchSpy).not.toHaveBeenCalled();
    const stored = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(stored.status).toBe("FAILED");
    expect(stored.lastError).toMatch(/private/i);
  });

  it("fails a delivery whose endpoint was switched off or removed", async () => {
    const { business, endpoint } = await setUpEndpoint();
    await emitWebhookEvent(business.id, "payment.received", {});
    const delivery = await prisma.webhookDelivery.findFirstOrThrow();
    await prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { active: false } });
    const fetchSpy = vi.spyOn(global, "fetch");

    await attemptDelivery(delivery.id, { resolveAddresses: PUBLIC });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe("FAILED");
  });

  it("does not send a delivery that already finished", async () => {
    const { business } = await setUpEndpoint();
    await emitWebhookEvent(business.id, "payment.received", {});
    const delivery = await prisma.webhookDelivery.findFirstOrThrow();
    await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "SUCCEEDED" } });
    const fetchSpy = vi.spyOn(global, "fetch");

    await attemptDelivery(delivery.id, { resolveAddresses: PUBLIC });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("retryDueWebhookDeliveries", () => {
  it("retries pending deliveries whose time has come, and leaves later ones alone", async () => {
    const { business } = await setUpEndpoint();
    await emitWebhookEvent(business.id, "payment.received", { n: 1 });
    await emitWebhookEvent(business.id, "payment.received", { n: 2 });
    const [due, later] = await prisma.webhookDelivery.findMany({ orderBy: { createdAt: "asc" } });
    await prisma.webhookDelivery.update({ where: { id: due!.id }, data: { attempts: 1, nextAttemptAt: new Date(Date.now() - 1000) } });
    await prisma.webhookDelivery.update({ where: { id: later!.id }, data: { attempts: 1, nextAttemptAt: new Date(Date.now() + 3_600_000) } });
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(okResponse());

    const retried = await retryDueWebhookDeliveries({ resolveAddresses: PUBLIC });

    expect(retried).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: due!.id } })).status).toBe("SUCCEEDED");
    expect((await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: later!.id } })).status).toBe("PENDING");
  });
});

describe("secret handling", () => {
  it("stores the signing secret encrypted", () => {
    const stored = encryptWithKey("whsec_test", WEBHOOK_SECRET_KEY_ENV);
    expect(stored).not.toContain("whsec_test");
    expect(decryptWithKey(stored, WEBHOOK_SECRET_KEY_ENV)).toBe("whsec_test");
  });
});
