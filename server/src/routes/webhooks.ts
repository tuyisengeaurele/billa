import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { createWebhookSchema, MAX_WEBHOOK_ENDPOINTS } from "@billa/shared";
import type { CreateWebhookInput } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { encryptWithKey } from "../lib/encryption.js";
import { queueTestDelivery, WEBHOOK_SECRET_KEY_ENV } from "../lib/webhooks/dispatch.js";
import { validateWebhookUrl } from "../lib/webhooks/url-safety.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireBusinessContext } from "../middleware/require-business.js";
import { requireOwner } from "../middleware/require-owner.js";
import { requireActiveSubscription } from "../middleware/require-active-subscription.js";
import { generalApiRateLimit } from "../middleware/general-rate-limit.js";
import { validateBody } from "../middleware/validate.js";

// Like API keys, webhooks are set up by the owner: they carry the business's data out of Billa.
export const webhooksRouter = Router();

webhooksRouter.use(requireAuth);
webhooksRouter.use(requireBusinessContext);
webhooksRouter.use(generalApiRateLimit);
webhooksRouter.use(requireOwner);
webhooksRouter.use(requireActiveSubscription);

const ENDPOINT_FIELDS = { id: true, url: true, events: true, active: true, createdAt: true } as const;
const updateWebhookSchema = z.object({ active: z.boolean() });

// Plain http is allowed only when a developer opts in on their own machine.
const allowInsecure = process.env.WEBHOOKS_ALLOW_INSECURE === "true";

webhooksRouter.get("/", async (req, res) => {
  const results = await prisma.webhookEndpoint.findMany({
    where: { businessId: req.auth!.businessId },
    orderBy: { createdAt: "desc" },
    select: ENDPOINT_FIELDS,
  });
  res.json({ results });
});

webhooksRouter.post("/", validateBody(createWebhookSchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const body = req.body as CreateWebhookInput;

  const check = validateWebhookUrl(body.url, { allowInsecure });
  if (!check.ok) {
    res.status(400).json({ error: "invalid_url", message: check.reason });
    return;
  }
  if ((await prisma.webhookEndpoint.count({ where: { businessId } })) >= MAX_WEBHOOK_ENDPOINTS) {
    res.status(409).json({ error: "too_many_webhooks" });
    return;
  }

  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      businessId,
      url: body.url,
      events: [...new Set(body.events)],
      secretEnc: encryptWithKey(secret, WEBHOOK_SECRET_KEY_ENV),
    },
    select: ENDPOINT_FIELDS,
  });

  // The only time the secret is visible; it is stored encrypted.
  res.status(201).json({ endpoint, secret });
});

async function findOwnEndpoint(businessId: string, id: string) {
  return prisma.webhookEndpoint.findFirst({ where: { id, businessId }, select: { id: true } });
}

webhooksRouter.patch("/:id", validateBody(updateWebhookSchema), async (req, res) => {
  const existing = await findOwnEndpoint(req.auth!.businessId, req.params.id);
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const endpoint = await prisma.webhookEndpoint.update({
    where: { id: existing.id },
    data: { active: (req.body as { active: boolean }).active },
    select: ENDPOINT_FIELDS,
  });
  res.json({ endpoint });
});

webhooksRouter.delete("/:id", async (req, res) => {
  const existing = await findOwnEndpoint(req.auth!.businessId, req.params.id);
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  await prisma.$transaction([
    prisma.webhookDelivery.deleteMany({ where: { endpointId: existing.id } }),
    prisma.webhookEndpoint.delete({ where: { id: existing.id } }),
  ]);
  res.json({ deleted: true });
});

webhooksRouter.post("/:id/test", async (req, res) => {
  const existing = await findOwnEndpoint(req.auth!.businessId, req.params.id);
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const deliveryId = await queueTestDelivery(existing.id);
  res.status(202).json({ deliveryId });
});

webhooksRouter.get("/:id/deliveries", async (req, res) => {
  const existing = await findOwnEndpoint(req.auth!.businessId, req.params.id);
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const results = await prisma.webhookDelivery.findMany({
    where: { endpointId: existing.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      event: true,
      status: true,
      attempts: true,
      lastStatusCode: true,
      lastError: true,
      nextAttemptAt: true,
      deliveredAt: true,
      createdAt: true,
    },
  });
  res.json({ results });
});
