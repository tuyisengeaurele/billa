import { Router } from "express";
import { createApiKeySchema, MAX_ACTIVE_API_KEYS } from "@billa/shared";
import type { CreateApiKeyInput } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { generateApiKey } from "../lib/api-keys.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireBusinessContext } from "../middleware/require-business.js";
import { requireOwner } from "../middleware/require-owner.js";
import { requireActiveSubscription } from "../middleware/require-active-subscription.js";
import { generalApiRateLimit } from "../middleware/general-rate-limit.js";
import { validateBody } from "../middleware/validate.js";

// Managing keys is the owner's job: a key can read and write all of the business's data.
export const apiKeysRouter = Router();

apiKeysRouter.use(requireAuth);
apiKeysRouter.use(requireBusinessContext);
apiKeysRouter.use(generalApiRateLimit);
apiKeysRouter.use(requireOwner);
apiKeysRouter.use(requireActiveSubscription);

const PUBLIC_FIELDS = { id: true, name: true, keyPrefix: true, lastUsedAt: true, revokedAt: true, createdAt: true } as const;

apiKeysRouter.get("/", async (req, res) => {
  const results = await prisma.apiKey.findMany({
    where: { businessId: req.auth!.businessId },
    orderBy: { createdAt: "desc" },
    select: PUBLIC_FIELDS,
  });
  res.json({ results });
});

apiKeysRouter.post("/", validateBody(createApiKeySchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const { name } = req.body as CreateApiKeyInput;

  const active = await prisma.apiKey.count({ where: { businessId, revokedAt: null } });
  if (active >= MAX_ACTIVE_API_KEYS) {
    res.status(409).json({ error: "too_many_api_keys" });
    return;
  }

  const { key, keyHash, keyPrefix } = generateApiKey();
  const apiKey = await prisma.apiKey.create({
    data: { businessId, name, keyHash, keyPrefix, createdByUserId: req.auth!.userId },
    select: PUBLIC_FIELDS,
  });

  // The only time the key is ever visible: only its hash is kept.
  res.status(201).json({ apiKey, key });
});

apiKeysRouter.delete("/:id", async (req, res) => {
  const result = await prisma.apiKey.updateMany({
    where: { id: req.params.id, businessId: req.auth!.businessId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ revoked: true });
});
