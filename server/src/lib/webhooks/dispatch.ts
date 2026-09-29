import { lookup } from "node:dns/promises";
import type { Prisma } from "@prisma/client";
import * as Sentry from "@sentry/node";
import type { WebhookEvent } from "@billa/shared";
import { prisma } from "../prisma.js";
import { decryptWithKey } from "../encryption.js";
import { signWebhookPayload } from "./signature.js";
import { isPrivateAddress, validateWebhookUrl } from "./url-safety.js";

export const WEBHOOK_SECRET_KEY_ENV = "WEBHOOK_SECRET_ENCRYPTION_KEY";

const MAX_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 8000;
// Waits before the 2nd, 3rd, 4th and 5th try. The hourly scheduler is what actually runs the
// retries, so in practice a retry lands on the first tick after its time.
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

export interface DeliveryDeps {
  resolveAddresses: (hostname: string) => Promise<string[]>;
}

const defaultDeps: DeliveryDeps = {
  resolveAddresses: async (hostname) => (await lookup(hostname, { all: true })).map((entry) => entry.address),
};

let scheduleAttempt: (deliveryId: string) => void = (deliveryId) => {
  void attemptDelivery(deliveryId).catch((err) => Sentry.captureException(err));
};

/** Lets tests decide when (and whether) a fresh delivery is sent. */
export function setDeliveryScheduler(fn: (deliveryId: string) => void): void {
  scheduleAttempt = fn;
}

/**
 * Records the event for every active endpoint that listens for it and starts sending. A webhook
 * problem must never break the request that caused the event, so nothing here throws.
 */
export async function emitWebhookEvent(businessId: string, event: WebhookEvent, data: Prisma.InputJsonValue): Promise<void> {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { businessId, active: true, events: { has: event } },
      select: { id: true },
    });
    for (const endpoint of endpoints) {
      const delivery = await prisma.webhookDelivery.create({
        data: { endpointId: endpoint.id, event, payload: { event, createdAt: new Date().toISOString(), data } },
      });
      scheduleAttempt(delivery.id);
    }
  } catch (err) {
    Sentry.captureException(err);
  }
}

async function finish(
  deliveryId: string,
  attempts: number,
  outcome: { statusCode: number | null; error: string | null; succeeded: boolean; permanent?: boolean },
): Promise<void> {
  if (outcome.succeeded) {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "SUCCEEDED",
        attempts,
        lastStatusCode: outcome.statusCode,
        lastError: null,
        nextAttemptAt: null,
        deliveredAt: new Date(),
      },
    });
    return;
  }
  const givingUp = outcome.permanent || attempts >= MAX_ATTEMPTS;
  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: givingUp ? "FAILED" : "PENDING",
      attempts,
      lastStatusCode: outcome.statusCode,
      lastError: outcome.error?.slice(0, 300) ?? null,
      nextAttemptAt: givingUp ? null : new Date(Date.now() + (RETRY_DELAYS_MS[attempts - 1] ?? RETRY_DELAYS_MS.at(-1)!)),
    },
  });
}

export async function attemptDelivery(deliveryId: string, deps: DeliveryDeps = defaultDeps): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { endpoint: true } });
  if (!delivery || delivery.status !== "PENDING") return;

  const attempts = delivery.attempts + 1;
  const { endpoint } = delivery;
  if (!endpoint.active) {
    await finish(deliveryId, attempts, { statusCode: null, error: "The endpoint is switched off", succeeded: false, permanent: true });
    return;
  }

  const check = validateWebhookUrl(endpoint.url);
  if (!check.ok) {
    await finish(deliveryId, attempts, { statusCode: null, error: check.reason, succeeded: false, permanent: true });
    return;
  }

  // Checked again now, not just when the URL was saved: a name can be pointed at a private
  // address afterwards. Every address it resolves to must be public.
  try {
    const addresses = await deps.resolveAddresses(new URL(endpoint.url).hostname);
    if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
      await finish(deliveryId, attempts, {
        statusCode: null,
        error: "The URL resolves to a private address",
        succeeded: false,
        permanent: true,
      });
      return;
    }
  } catch (err) {
    await finish(deliveryId, attempts, {
      statusCode: null,
      error: `Could not look up the address: ${err instanceof Error ? err.message : "unknown error"}`,
      succeeded: false,
    });
    return;
  }

  const secret = decryptWithKey(endpoint.secretEnc, WEBHOOK_SECRET_KEY_ENV);
  const body = JSON.stringify({ id: delivery.id, ...(delivery.payload as Record<string, unknown>) });

  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Billa-Webhooks/1.0",
        "Billa-Signature": signWebhookPayload(secret, body),
        "Billa-Event": delivery.event,
        "Billa-Delivery": delivery.id,
      },
      body,
      // A redirect could point at a private address the checks above never saw.
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const succeeded = response.status >= 200 && response.status < 300;
    await finish(deliveryId, attempts, {
      statusCode: response.status,
      error: succeeded ? null : `The receiver answered ${response.status}`,
      succeeded,
    });
  } catch (err) {
    await finish(deliveryId, attempts, {
      statusCode: null,
      error: err instanceof Error ? err.message : "The request failed",
      succeeded: false,
    });
  }
}

/** Run by the hourly scheduler: sends every pending delivery whose retry time has come. Returns how many it tried. */
export async function retryDueWebhookDeliveries(deps: DeliveryDeps = defaultDeps): Promise<number> {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: 100,
    select: { id: true },
  });
  for (const { id } of due) {
    await attemptDelivery(id, deps);
  }
  return due.length;
}
