# Multi-Business Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one account own up to 3 businesses and switch between them, with a single subscription covering the whole account instead of one subscription per business.

**Architecture:** Flip `User.businessId` (one business per user) to `Business.ownerId` (one owner per business, many businesses per owner). Move `trialEndsAt`/`currentPeriodEnd`/`plan` from `Business` to `User`. The session JWT still carries `{userId, businessId}` exactly as today; a new `POST /auth/switch-business` re-mints it after verifying ownership. `requireAuth` and every business-scoped route (`documents.ts`, `customers.ts`, `items.ts`, `business.ts`) are untouched — they still just read `req.auth!.businessId`.

**Tech Stack:** Express, Prisma, React, Vitest, React Testing Library — matching every other route/page in this codebase.

**Important note on verification order:** Task 1's schema change touches fields referenced across the whole server workspace. Until Tasks 2–6 land, `npm run typecheck` and `npm test` in the server workspace will show failures in files this plan hasn't reached yet — that's expected, not a regression to chase down mid-plan. Each task verifies only the test files it specifically touches; the full-workspace green check happens once, in the final task.

---

### Task 1: Schema migration

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_multi_business/migration.sql`
- Modify: `server/src/lib/pdf/render-data.test.ts`

- [ ] **Step 1: Edit the schema**

In `server/prisma/schema.prisma`, replace the `Business` model with:

```prisma
model Business {
  id               String            @id @default(cuid())
  ownerId          String
  name             String
  tin              String?
  industry         String?
  phone            String?
  email            String?
  address          String?
  logoUrl          String?
  primaryColor     String?
  accentColors     Json?
  rraEbmNumber     String?
  defaultTemplate  DocumentTemplate  @default(MINIMAL)
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  owner     User               @relation(fields: [ownerId], references: [id])
  customers Customer[]
  items     Item[]
  documents Document[]
  sequences DocumentSequence[]

  @@index([ownerId])
}
```

Replace the `User` model with:

```prisma
model User {
  id                   String            @id @default(cuid())
  email                String            @unique
  firebaseUid          String            @unique
  name                 String?
  trialEndsAt          DateTime
  currentPeriodEnd     DateTime?
  plan                 SubscriptionPlan?
  lastActiveBusinessId String?
  createdAt            DateTime          @default(now())
  updatedAt            DateTime          @updatedAt

  businesses    Business[]
  refreshTokens RefreshToken[]
  payments      Payment[]
}
```

Replace the `RefreshToken` model with:

```prisma
model RefreshToken {
  id         String    @id @default(cuid())
  userId     String
  businessId String
  tokenHash  String
  family     String
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
}
```

Replace the `Payment` model with:

```prisma
model Payment {
  id              String           @id @default(cuid())
  userId          String
  plan            SubscriptionPlan
  amount          Int
  currency        String
  txRef           String           @unique
  flutterwaveTxId String?
  status          PaymentStatus    @default(PENDING)
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
}
```

- [ ] **Step 2: Apply the migration**

This is pre-launch dev data (no real users), so reset both databases rather than writing a backfill:

```bash
cd server
DEV_URL="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2-)"
TEST_URL="$(grep -m1 '^DATABASE_URL=' .env.test | cut -d= -f2-)"
DATABASE_URL="$DEV_URL" npx prisma migrate reset --force
DATABASE_URL="$TEST_URL" npx prisma migrate reset --force
npx prisma migrate diff --from-url "$DEV_URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/diff.sql
```

Create a timestamped migration folder (`date +%Y%m%d%H%M%S` for the prefix) and move the generated SQL into it as `migration.sql`, e.g.:

```bash
STAMP=$(date +%Y%m%d%H%M%S)
mkdir -p "prisma/migrations/${STAMP}_multi_business"
mv prisma/migrations/diff.sql "prisma/migrations/${STAMP}_multi_business/migration.sql"
```

Apply it to both databases and regenerate the client:

```bash
DATABASE_URL="$DEV_URL" npx prisma migrate deploy
DATABASE_URL="$TEST_URL" npx prisma migrate deploy
npx prisma generate
```

Expected: both `migrate deploy` calls succeed, `prisma generate` succeeds. If `prisma generate` fails with a Windows `EPERM` file-lock error, a running dev-server process is holding the query engine file — stop it (`taskkill` on the `tsx watch` process chain) and re-run `prisma generate`.

- [ ] **Step 3: Fix the one fixture the schema change breaks**

In `server/src/lib/pdf/render-data.test.ts`, the `makeBusiness()` fixture is typed against the real `Business` type and will no longer compile. Change:

```ts
    rraEbmNumber: "EBM-1",
    defaultTemplate: "MINIMAL",
    trialEndsAt: new Date("2026-09-01T00:00:00.000Z"),
    currentPeriodEnd: null,
    plan: null,
    createdAt: new Date(),
```

to:

```ts
    rraEbmNumber: "EBM-1",
    defaultTemplate: "MINIMAL",
    ownerId: "u1",
    createdAt: new Date(),
```

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations server/src/lib/pdf/render-data.test.ts
git commit -m "flip business ownership to support multiple businesses per account"
```

---

### Task 2: Session helper and auth routes

**Files:**
- Create: `server/src/lib/session.ts`
- Modify: `server/src/routes/auth.ts`
- Modify: `server/src/routes/auth.session.test.ts`
- Create: `shared/src/multi-business-schemas.ts`
- Create: `shared/src/multi-business-schemas.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Write the failing shared-schema tests**

Create `shared/src/multi-business-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createBusinessSchema, switchBusinessSchema } from "./multi-business-schemas.js";

describe("switchBusinessSchema", () => {
  it("accepts a non-empty businessId", () => {
    expect(switchBusinessSchema.safeParse({ businessId: "biz1" }).success).toBe(true);
  });

  it("rejects an empty businessId", () => {
    expect(switchBusinessSchema.safeParse({ businessId: "" }).success).toBe(false);
  });
});

describe("createBusinessSchema", () => {
  it("accepts a non-empty name", () => {
    expect(createBusinessSchema.safeParse({ name: "Side Hustle" }).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(createBusinessSchema.safeParse({ name: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd shared && npx vitest run src/multi-business-schemas.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Write the schemas**

Create `shared/src/multi-business-schemas.ts`:

```ts
import { z } from "zod";

export const BUSINESS_LIMIT = 3;

export const switchBusinessSchema = z.object({
  businessId: z.string().trim().min(1),
});
export type SwitchBusinessInput = z.infer<typeof switchBusinessSchema>;

export const createBusinessSchema = z.object({
  name: z.string().trim().min(1),
});
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
```

In `shared/src/index.ts`, add:

```ts
export * from "./multi-business-schemas.js";
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `cd shared && npx vitest run src/multi-business-schemas.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Extract the session-minting helper**

Create `server/src/lib/session.ts`:

```ts
import crypto from "node:crypto";
import type { Response } from "express";
import { prisma } from "./prisma.js";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "./tokens.js";
import { ttlToMs } from "./ttl.js";
import { setAccessTokenCookie, setRefreshTokenCookie } from "./cookies.js";

function refreshTtlMs(): number {
  return ttlToMs(process.env.JWT_REFRESH_TTL ?? "30d");
}

export async function issueSession(res: Response, userId: string, businessId: string) {
  const accessToken = signAccessToken({ userId, businessId });
  const refreshToken = generateRefreshToken();
  const ttlMs = refreshTtlMs();

  await prisma.refreshToken.create({
    data: {
      userId,
      businessId,
      tokenHash: hashRefreshToken(refreshToken),
      family: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });

  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, refreshToken, ttlMs);
}
```

- [ ] **Step 6: Add the failing test for sign-in resolving the last active business**

Add this test inside the existing `describe("POST /auth/session", ...)` block in `server/src/routes/auth.session.test.ts`, right before the closing `});`:

```ts
  it("signs in to the account's last active business when it owns more than one", async () => {
    const app = createApp();
    const firstRes = await request(app).post("/auth/session").send({
      idToken: fakeIdToken("uid-1", "owner@example.com"),
      businessName: "Kigali Traders",
    });
    const userId = firstRes.body.user.id as string;
    const secondBusiness = await prisma.business.create({ data: { name: "Side Hustle", ownerId: userId } });
    await prisma.user.update({ where: { id: userId }, data: { lastActiveBusinessId: secondBusiness.id } });

    const res = await request(app).post("/auth/session").send({ idToken: fakeIdToken("uid-1", "owner@example.com") });

    expect(res.body.business.name).toBe("Side Hustle");
  });
```

Also change the existing test `"sets a 14-day trial on a newly created business"` to check the trial on the user instead of the business:

```ts
  it("sets a 14-day trial on a newly created account", async () => {
    const res = await request(createApp()).post("/auth/session").send({
      idToken: fakeIdToken("uid-1", "owner@example.com"),
      businessName: "Kigali Traders",
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.body.user.id } });
    const daysUntilTrialEnd = (user.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysUntilTrialEnd).toBeGreaterThan(13.9);
    expect(daysUntilTrialEnd).toBeLessThan(14.1);
  });
```

- [ ] **Step 7: Run it to confirm the new test fails**

Run: `cd server && npx vitest run src/routes/auth.session.test.ts`
Expected: FAIL on the new "last active business" test (route doesn't support multiple businesses yet) and on the renamed trial test (business no longer has `trialEndsAt`, so this currently fails to even compile — expected per the note at the top of this plan).

- [ ] **Step 8: Rewrite the auth routes**

Replace the full contents of `server/src/routes/auth.ts`:

```ts
import { Router } from "express";
import { sessionSchema, switchBusinessSchema } from "@billa/shared";
import type { SessionInput, SwitchBusinessInput } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { verifyFirebaseToken } from "../lib/firebase-admin.js";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "../lib/tokens.js";
import { ttlToMs } from "../lib/ttl.js";
import { clearAuthCookies, setAccessTokenCookie, setRefreshTokenCookie } from "../lib/cookies.js";
import { issueSession } from "../lib/session.js";
import { validateBody } from "../middleware/validate.js";
import { authRateLimit } from "../middleware/auth-rate-limit.js";
import { requireAuth } from "../middleware/require-auth.js";

export const authRouter = Router();

function refreshTtlMs(): number {
  return ttlToMs(process.env.JWT_REFRESH_TTL ?? "30d");
}

authRouter.post("/session", authRateLimit, validateBody(sessionSchema), async (req, res) => {
  const { idToken, businessName } = req.body as SessionInput;

  let firebaseUser: { uid: string; email: string };
  try {
    firebaseUser = await verifyFirebaseToken(idToken);
  } catch {
    res.status(401).json({ error: "invalid_token" });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { firebaseUid: firebaseUser.uid } });
  if (existing) {
    let businessId = existing.lastActiveBusinessId;
    if (!businessId) {
      const firstBusiness = await prisma.business.findFirstOrThrow({
        where: { ownerId: existing.id },
        orderBy: { createdAt: "asc" },
      });
      businessId = firstBusiness.id;
    }
    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    await issueSession(res, existing.id, businessId);
    res.json({
      user: { id: existing.id, email: existing.email },
      business: { id: business.id, name: business.name },
    });
    return;
  }

  if (!businessName) {
    res.status(404).json({ error: "no_account" });
    return;
  }

  const { user, business } = await prisma.$transaction(async (tx) => {
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const user = await tx.user.create({
      data: { email: firebaseUser.email, firebaseUid: firebaseUser.uid, trialEndsAt },
    });
    const business = await tx.business.create({ data: { name: businessName, ownerId: user.id } });
    const updatedUser = await tx.user.update({
      where: { id: user.id },
      data: { lastActiveBusinessId: business.id },
    });
    return { user: updatedUser, business };
  });

  await issueSession(res, user.id, business.id);
  res.status(201).json({
    user: { id: user.id, email: user.email },
    business: { id: business.id, name: business.name },
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const business = await prisma.business.findUnique({ where: { id: req.auth!.businessId } });
  if (!business) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  res.json({
    user: { id: user.id, email: user.email },
    business: { id: business.id, name: business.name },
  });
});

authRouter.post("/switch-business", requireAuth, validateBody(switchBusinessSchema), async (req, res) => {
  const { businessId } = req.body as SwitchBusinessInput;
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business || business.ownerId !== req.auth!.userId) {
    res.status(403).json({ error: "not_owner" });
    return;
  }
  await prisma.user.update({ where: { id: req.auth!.userId }, data: { lastActiveBusinessId: businessId } });
  await issueSession(res, req.auth!.userId, businessId);
  res.json({ business: { id: business.id, name: business.name } });
});

authRouter.post("/refresh", async (req, res) => {
  const presented = req.cookies?.refresh_token;
  if (!presented) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const presentedHash = hashRefreshToken(presented);
  const stored = await prisma.refreshToken.findFirst({ where: { tokenHash: presentedHash } });

  if (!stored) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { family: stored.family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    res.status(401).json({ error: "token_reuse_detected" });
    return;
  }

  if (stored.expiresAt < new Date()) {
    res.status(401).json({ error: "expired" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const accessToken = signAccessToken({ userId: user.id, businessId: stored.businessId });
  const newRefreshToken = generateRefreshToken();
  const ttlMs = refreshTtlMs();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      businessId: stored.businessId,
      tokenHash: hashRefreshToken(newRefreshToken),
      family: stored.family,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });

  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, newRefreshToken, ttlMs);
  res.json({ ok: true });
});

authRouter.post("/logout", async (req, res) => {
  const presented = req.cookies?.refresh_token;
  if (presented) {
    const presentedHash = hashRefreshToken(presented);
    await prisma.refreshToken.updateMany({
      where: { tokenHash: presentedHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  clearAuthCookies(res);
  res.json({ ok: true });
});
```

- [ ] **Step 9: Run it to confirm it passes**

Run: `cd server && npx vitest run src/routes/auth.session.test.ts src/routes/auth.me.test.ts src/routes/auth.refresh.test.ts src/routes/auth.logout.test.ts`
Expected: PASS, all tests (the existing `/me`, `/refresh`, `/logout` tests pass unchanged since their request/response shapes didn't move).

- [ ] **Step 10: Commit**

```bash
git add server/src/lib/session.ts server/src/routes/auth.ts server/src/routes/auth.session.test.ts shared/src/multi-business-schemas.ts shared/src/multi-business-schemas.test.ts shared/src/index.ts
git commit -m "add account-level trial fields and a switch-business endpoint"
```

---

### Task 3: Businesses router

**Files:**
- Create: `server/src/routes/businesses.ts`
- Create: `server/src/routes/businesses.test.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/routes/businesses.test.ts`:

```ts
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

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return { cookies: res.headers["set-cookie"] as unknown as string[], userId: res.body.user.id as string };
}

describe("GET /businesses", () => {
  it("lists businesses owned by the caller, ordered by creation", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app);
    await prisma.business.create({ data: { name: "Side Hustle", ownerId: userId } });

    const res = await request(app).get("/businesses").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.businesses.map((b: { name: string }) => b.name)).toEqual(["Kigali Traders", "Side Hustle"]);
  });

  it("does not include another account's businesses", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app);
    await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });

    const res = await request(app).get("/businesses").set("Cookie", cookies);

    expect(res.body.businesses).toHaveLength(1);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/businesses");
    expect(res.status).toBe(401);
  });
});

describe("POST /businesses", () => {
  it("creates a new business and switches the session into it", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app);

    const res = await request(app).post("/businesses").set("Cookie", cookies).send({ name: "Side Hustle" });

    expect(res.status).toBe(201);
    expect(res.body.business.name).toBe("Side Hustle");

    const newCookies = res.headers["set-cookie"] as unknown as string[];
    const meRes = await request(app).get("/auth/me").set("Cookie", newCookies);
    expect(meRes.body.business.name).toBe("Side Hustle");

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.lastActiveBusinessId).toBe(res.body.business.id);
  });

  it("returns 409 once the account already owns 3 businesses", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app);
    await prisma.business.create({ data: { name: "Second", ownerId: userId } });
    await prisma.business.create({ data: { name: "Third", ownerId: userId } });

    const res = await request(app).post("/businesses").set("Cookie", cookies).send({ name: "Fourth" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("business_limit_reached");
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/businesses").send({ name: "Side Hustle" });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/routes/businesses.test.ts`
Expected: FAIL — `/businesses` doesn't exist yet.

- [ ] **Step 3: Write the router**

Create `server/src/routes/businesses.ts`:

```ts
import { Router } from "express";
import { BUSINESS_LIMIT, createBusinessSchema } from "@billa/shared";
import type { CreateBusinessInput } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate.js";
import { issueSession } from "../lib/session.js";

export const businessesRouter = Router();

businessesRouter.use(requireAuth);

businessesRouter.get("/", async (req, res) => {
  const businesses = await prisma.business.findMany({
    where: { ownerId: req.auth!.userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  res.json({ businesses });
});

businessesRouter.post("/", validateBody(createBusinessSchema), async (req, res) => {
  const { name } = req.body as CreateBusinessInput;
  const ownerId = req.auth!.userId;

  const count = await prisma.business.count({ where: { ownerId } });
  if (count >= BUSINESS_LIMIT) {
    res.status(409).json({ error: "business_limit_reached" });
    return;
  }

  const business = await prisma.business.create({ data: { name, ownerId } });
  await prisma.user.update({ where: { id: ownerId }, data: { lastActiveBusinessId: business.id } });
  await issueSession(res, ownerId, business.id);
  res.status(201).json({ business: { id: business.id, name: business.name } });
});
```

- [ ] **Step 4: Mount the router**

In `server/src/app.ts`, add the import alongside the other route imports:

```ts
import { businessesRouter } from "./routes/businesses.js";
```

And mount it alongside the other routers:

```ts
  app.use("/businesses", businessesRouter);
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `cd server && npx vitest run src/routes/businesses.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/businesses.ts server/src/routes/businesses.test.ts server/src/app.ts
git commit -m "add GET and POST /businesses for listing and creating additional businesses"
```

---

### Task 4: Account-level subscription gate

**Files:**
- Modify: `server/src/middleware/require-active-subscription.ts`
- Modify: `server/src/middleware/require-active-subscription.test.ts`

- [ ] **Step 1: Rewrite the test to key off the user**

Replace the full contents of `server/src/middleware/require-active-subscription.test.ts`:

```ts
import crypto from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { requireActiveSubscription } from "./require-active-subscription.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
});

beforeEach(resetDb);

function testApp(userId: string) {
  const app = express();
  app.use((req, _res, next) => {
    req.auth = { userId, businessId: "irrelevant" };
    next();
  });
  app.get("/probe", requireActiveSubscription, (_req, res) => res.json({ ok: true }));
  app.post("/probe", requireActiveSubscription, (_req, res) => res.json({ ok: true }));
  return app;
}

async function createUser(overrides: { trialEndsAt: Date; currentPeriodEnd?: Date | null }) {
  const user = await prisma.user.create({
    data: {
      email: `${crypto.randomUUID()}@example.com`,
      firebaseUid: crypto.randomUUID(),
      trialEndsAt: overrides.trialEndsAt,
      currentPeriodEnd: overrides.currentPeriodEnd,
    },
  });
  return user.id;
}

describe("requireActiveSubscription", () => {
  it("allows GET requests regardless of subscription state", async () => {
    const userId = await createUser({ trialEndsAt: new Date(Date.now() - 1000) });
    const res = await request(testApp(userId)).get("/probe");
    expect(res.status).toBe(200);
  });

  it("allows non-GET requests during an active trial", async () => {
    const userId = await createUser({ trialEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24) });
    const res = await request(testApp(userId)).post("/probe");
    expect(res.status).toBe(200);
  });

  it("blocks non-GET requests once the trial has lapsed with no payment", async () => {
    const userId = await createUser({ trialEndsAt: new Date(Date.now() - 1000) });
    const res = await request(testApp(userId)).post("/probe");
    expect(res.status).toBe(402);
    expect(res.body.error).toBe("subscription_required");
  });

  it("allows non-GET requests during an active paid period even if the trial already ended", async () => {
    const userId = await createUser({
      trialEndsAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20),
      currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
    });
    const res = await request(testApp(userId)).post("/probe");
    expect(res.status).toBe(200);
  });

  it("blocks non-GET requests once a paid period has also lapsed", async () => {
    const userId = await createUser({
      trialEndsAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40),
      currentPeriodEnd: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
    });
    const res = await request(testApp(userId)).post("/probe");
    expect(res.status).toBe(402);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/middleware/require-active-subscription.test.ts`
Expected: FAIL — the middleware still reads from `Business`.

- [ ] **Step 3: Rewrite the middleware**

Replace the full contents of `server/src/middleware/require-active-subscription.ts`:

```ts
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET") {
    next();
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const activeUntil = user.currentPeriodEnd ?? user.trialEndsAt;
  if (activeUntil > new Date()) {
    next();
    return;
  }

  res.status(402).json({ error: "subscription_required" });
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `cd server && npx vitest run src/middleware/require-active-subscription.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Fix the subscription-gate integration test's helper**

In `server/src/routes/subscription-gate.test.ts`, replace the `registerWithExpiredTrial` function:

```ts
async function registerWithExpiredTrial(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  const cookies = res.headers["set-cookie"] as unknown as string[];
  await prisma.user.update({
    where: { id: res.body.user.id },
    data: { trialEndsAt: new Date(Date.now() - 1000) },
  });
  return cookies;
}
```

- [ ] **Step 6: Run it to confirm it passes**

Run: `cd server && npx vitest run src/routes/subscription-gate.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 7: Commit**

```bash
git add server/src/middleware/require-active-subscription.ts server/src/middleware/require-active-subscription.test.ts server/src/routes/subscription-gate.test.ts
git commit -m "key the subscription gate off the account instead of the business"
```

---

### Task 5: Account-level billing

**Files:**
- Modify: `server/src/routes/billing.ts`
- Modify: `server/src/routes/billing.verify.test.ts`
- Modify: `server/src/routes/billing.webhook.test.ts`

`billing.checkout.test.ts` and `billing.status.test.ts` need no changes — neither references `businessId` or the business model directly, and the API response shapes they assert on are unchanged.

- [ ] **Step 1: Update the failing tests**

Replace the full contents of `server/src/routes/billing.verify.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";

vi.mock("../lib/flutterwave.js", () => ({
  initiateCheckout: vi.fn(),
  verifyTransaction: vi.fn(),
}));

import { verifyTransaction } from "../lib/flutterwave.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return { cookies: res.headers["set-cookie"] as unknown as string[], userId: res.body.user.id as string };
}

async function createPendingPayment(userId: string, plan: "MONTHLY" | "ANNUAL", amount: number) {
  return prisma.payment.create({
    data: { userId, plan, amount, currency: "RWF", txRef: `billa-${userId}-test`, status: "PENDING" },
  });
}

describe("POST /billing/verify", () => {
  it("extends currentPeriodEnd on a genuine successful payment", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app);
    const payment = await createPendingPayment(userId, "MONTHLY", 6500);

    vi.mocked(verifyTransaction).mockResolvedValue({
      txRef: payment.txRef,
      amount: 6500,
      currency: "RWF",
      status: "successful",
    });

    const res = await request(app)
      .post("/billing/verify")
      .set("Cookie", cookies)
      .send({ txRef: payment.txRef, transactionId: "fw-123" });

    expect(res.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.plan).toBe("MONTHLY");
    expect(user.currentPeriodEnd).not.toBeNull();
    expect(user.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now());

    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { txRef: payment.txRef } });
    expect(updatedPayment.status).toBe("SUCCESSFUL");
    expect(updatedPayment.flutterwaveTxId).toBe("fw-123");
  });

  it("is idempotent when called twice for the same payment", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app);
    const payment = await createPendingPayment(userId, "MONTHLY", 6500);

    vi.mocked(verifyTransaction).mockResolvedValue({
      txRef: payment.txRef,
      amount: 6500,
      currency: "RWF",
      status: "successful",
    });

    await request(app)
      .post("/billing/verify")
      .set("Cookie", cookies)
      .send({ txRef: payment.txRef, transactionId: "fw-123" });
    const firstPeriodEnd = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).currentPeriodEnd;

    const res = await request(app)
      .post("/billing/verify")
      .set("Cookie", cookies)
      .send({ txRef: payment.txRef, transactionId: "fw-123" });

    expect(res.status).toBe(200);
    const secondPeriodEnd = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).currentPeriodEnd;
    expect(secondPeriodEnd?.getTime()).toBe(firstPeriodEnd?.getTime());
  });

  it("stacks an early renewal on top of remaining time instead of resetting it", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app);
    const futureEnd = new Date(Date.now() + 1000 * 60 * 60 * 24 * 10);
    await prisma.user.update({ where: { id: userId }, data: { currentPeriodEnd: futureEnd, plan: "MONTHLY" } });
    const payment = await createPendingPayment(userId, "MONTHLY", 6500);

    vi.mocked(verifyTransaction).mockResolvedValue({
      txRef: payment.txRef,
      amount: 6500,
      currency: "RWF",
      status: "successful",
    });

    await request(app)
      .post("/billing/verify")
      .set("Cookie", cookies)
      .send({ txRef: payment.txRef, transactionId: "fw-123" });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const expectedEnd = futureEnd.getTime() + 30 * 24 * 60 * 60 * 1000;
    expect(user.currentPeriodEnd!.getTime()).toBe(expectedEnd);
  });

  it("marks the payment failed when the verified amount doesn't match", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app);
    const payment = await createPendingPayment(userId, "MONTHLY", 6500);

    vi.mocked(verifyTransaction).mockResolvedValue({
      txRef: payment.txRef,
      amount: 100,
      currency: "RWF",
      status: "successful",
    });

    const res = await request(app)
      .post("/billing/verify")
      .set("Cookie", cookies)
      .send({ txRef: payment.txRef, transactionId: "fw-123" });

    expect(res.status).toBe(400);
    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { txRef: payment.txRef } });
    expect(updatedPayment.status).toBe("FAILED");
  });

  it("returns 404 for a txRef belonging to another account", async () => {
    const app = createApp();
    const { userId } = await registerAndGetCookies(app);
    const payment = await createPendingPayment(userId, "MONTHLY", 6500);

    const otherRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app)
      .post("/billing/verify")
      .set("Cookie", otherCookies)
      .send({ txRef: payment.txRef, transactionId: "fw-123" });

    expect(res.status).toBe(404);
  });
});
```

In `server/src/routes/billing.webhook.test.ts`, replace the payment-setup portion of the `"extends the business's period on a genuine webhook"` test:

```ts
    const businessId = registerRes.body.business.id as string;
    const user = await prisma.user.findFirstOrThrow({ where: { businessId } });
    const payment = await prisma.payment.create({
      data: {
        businessId,
        userId: user.id,
        plan: "MONTHLY",
        amount: 6500,
        currency: "RWF",
        txRef: "billa-test-webhook",
        status: "PENDING",
      },
    });
```

becomes:

```ts
    const userId = registerRes.body.user.id as string;
    const payment = await prisma.payment.create({
      data: {
        userId,
        plan: "MONTHLY",
        amount: 6500,
        currency: "RWF",
        txRef: "billa-test-webhook",
        status: "PENDING",
      },
    });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/routes/billing.verify.test.ts src/routes/billing.webhook.test.ts`
Expected: FAIL — `billing.ts` still reads/writes `Business`.

- [ ] **Step 3: Rewrite the billing routes**

Replace the full contents of `server/src/routes/billing.ts`:

```ts
import crypto from "node:crypto";
import { Router } from "express";
import { billingCheckoutSchema, billingVerifySchema, PLAN_PRICES } from "@billa/shared";
import type { BillingCheckoutInput, BillingVerifyInput } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate.js";
import { initiateCheckout, verifyTransaction } from "../lib/flutterwave.js";

export const billingRouter = Router();

const PLAN_DAYS: Record<"MONTHLY" | "ANNUAL", number> = { MONTHLY: 30, ANNUAL: 365 };

billingRouter.post("/checkout", requireAuth, validateBody(billingCheckoutSchema), async (req, res) => {
  const { plan } = req.body as BillingCheckoutInput;
  const userId = req.auth!.userId;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const txRef = `billa-${userId}-${crypto.randomUUID()}`;
  await prisma.payment.create({
    data: { userId, plan, amount: PLAN_PRICES[plan], currency: "RWF", txRef, status: "PENDING" },
  });
  const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  const { link } = await initiateCheckout({
    txRef,
    amount: PLAN_PRICES[plan],
    currency: "RWF",
    redirectUrl: `${clientOrigin}/billing/callback`,
    customerEmail: user!.email,
  });
  res.json({ link });
});

async function verifyAndRecordPayment(
  txRef: string,
  transactionId: string,
): Promise<"success" | "already_processed" | "mismatch"> {
  const payment = await prisma.payment.findUnique({ where: { txRef } });
  if (!payment) throw new Error("payment_not_found");
  if (payment.status === "SUCCESSFUL") return "already_processed";
  const verified = await verifyTransaction(transactionId);
  if (
    verified.txRef !== txRef ||
    verified.status !== "successful" ||
    verified.amount < payment.amount ||
    verified.currency !== payment.currency
  ) {
    await prisma.payment.update({ where: { txRef }, data: { status: "FAILED" } });
    return "mismatch";
  }
  const user = await prisma.user.findUnique({ where: { id: payment.userId } });
  const now = new Date();
  const base = user!.currentPeriodEnd && user!.currentPeriodEnd > now ? user!.currentPeriodEnd : now;
  const currentPeriodEnd = new Date(base.getTime() + PLAN_DAYS[payment.plan] * 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.payment.update({ where: { txRef }, data: { status: "SUCCESSFUL", flutterwaveTxId: transactionId } }),
    prisma.user.update({ where: { id: payment.userId }, data: { currentPeriodEnd, plan: payment.plan } }),
  ]);
  return "success";
}

billingRouter.post("/verify", requireAuth, validateBody(billingVerifySchema), async (req, res) => {
  const { txRef, transactionId } = req.body as BillingVerifyInput;
  const userId = req.auth!.userId;
  const payment = await prisma.payment.findFirst({ where: { txRef, userId } });
  if (!payment) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  try {
    const result = await verifyAndRecordPayment(txRef, transactionId);
    if (result === "mismatch") {
      res.status(400).json({ error: "verification_failed" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "verification_failed" });
  }
});

billingRouter.post("/webhook", async (req, res) => {
  const signature = req.header("verif-hash");
  if (!signature || signature !== process.env.FLUTTERWAVE_WEBHOOK_HASH) {
    res.status(401).json({ error: "invalid_signature" });
    return;
  }
  const txRef = req.body?.data?.tx_ref as string | undefined;
  const transactionId = req.body?.data?.id ? String(req.body.data.id) : undefined;
  if (!txRef || !transactionId) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  try {
    await verifyAndRecordPayment(txRef, transactionId);
  } catch {
    /* swallow */
  }
  res.json({ ok: true });
});

billingRouter.get("/status", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const activeUntil = user.currentPeriodEnd ?? user.trialEndsAt;
  res.json({ trialEndsAt: user.trialEndsAt, currentPeriodEnd: user.currentPeriodEnd, plan: user.plan, activeUntil });
});
```

- [ ] **Step 4: Run the billing tests to confirm they pass**

Run: `cd server && npx vitest run src/routes/billing.checkout.test.ts src/routes/billing.verify.test.ts src/routes/billing.webhook.test.ts src/routes/billing.status.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/billing.ts server/src/routes/billing.verify.test.ts server/src/routes/billing.webhook.test.ts
git commit -m "move subscription state from the business to the account in billing"
```

---

### Task 6: Test database cleanup order

**Files:**
- Modify: `server/src/test/db.ts`

- [ ] **Step 1: Reorder the deletions**

`Business.ownerId` now references `User`, so `Business` rows must be deleted before `User` rows (the reverse of today's order). Replace the full contents of `server/src/test/db.ts`:

```ts
import { prisma } from "../lib/prisma.js";

export async function resetDb() {
  await prisma.documentLine.deleteMany();
  await prisma.document.deleteMany();
  await prisma.documentSequence.deleteMany();
  await prisma.item.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.business.deleteMany();
  await prisma.user.deleteMany();
}
```

- [ ] **Step 2: Run the full server suite to confirm this unblocks everything**

Run: `cd server && npm test`
Expected: PASS — every test file in the server workspace should now be green, since Tasks 1–6 together have touched every file the schema change affected.

- [ ] **Step 3: Typecheck the server workspace**

Run: `cd server && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/test/db.ts
git commit -m "delete businesses before users in test cleanup now that business owns the FK"
```

---

### Task 7: Business switcher UI

**Files:**
- Create: `client/src/components/BusinessSwitcher.tsx`
- Create: `client/src/components/BusinessSwitcher.test.tsx`
- Modify: `client/src/components/AppLayout.tsx`

- [ ] **Step 1: Write the failing tests**

Create `client/src/components/BusinessSwitcher.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { BusinessSwitcher } from "./BusinessSwitcher";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function mockFetch(businesses: { id: string; name: string }[]) {
  vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = urlOf(input);
    if (url.includes("/auth/me")) {
      return new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com" },
          business: { id: businesses[0].id, name: businesses[0].name },
        }),
        { status: 200 },
      );
    }
    if (url.includes("/businesses") && init?.method === "POST") {
      return new Response(JSON.stringify({ business: { id: "new-biz", name: "New Co" } }), { status: 201 });
    }
    if (url.includes("/businesses")) {
      return new Response(JSON.stringify({ businesses }), { status: 200 });
    }
    if (url.includes("/auth/switch-business")) {
      return new Response(JSON.stringify({ business: businesses[1] }), { status: 200 });
    }
    return new Response("{}", { status: 401 });
  });
}

function renderSwitcher() {
  return render(
    <AuthProvider>
      <BusinessSwitcher />
    </AuthProvider>,
  );
}

describe("BusinessSwitcher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows plain branding with one business and no dropdown", async () => {
    mockFetch([{ id: "b1", name: "Kigali Traders" }]);

    renderSwitcher();

    expect(await screen.findByText("Billa · Kigali Traders")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a dropdown listing every business when there is more than one", async () => {
    mockFetch([
      { id: "b1", name: "Kigali Traders" },
      { id: "b2", name: "Side Hustle" },
    ]);
    const user = userEvent.setup();

    renderSwitcher();

    await user.click(await screen.findByRole("button", { name: /Billa · Kigali Traders/i }));

    expect(screen.getByRole("button", { name: "Side Hustle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add another business/i })).toBeInTheDocument();
  });

  it("hides the add-business action once the account owns 3 businesses", async () => {
    mockFetch([
      { id: "b1", name: "Kigali Traders" },
      { id: "b2", name: "Side Hustle" },
      { id: "b3", name: "Third Co" },
    ]);
    const user = userEvent.setup();

    renderSwitcher();

    await user.click(await screen.findByRole("button", { name: /Billa · Kigali Traders/i }));

    expect(screen.queryByRole("button", { name: /add another business/i })).not.toBeInTheDocument();
  });

  it("calls switch-business with the selected business id", async () => {
    mockFetch([
      { id: "b1", name: "Kigali Traders" },
      { id: "b2", name: "Side Hustle" },
    ]);
    const user = userEvent.setup();

    renderSwitcher();

    await user.click(await screen.findByRole("button", { name: /Billa · Kigali Traders/i }));
    await user.click(screen.getByRole("button", { name: "Side Hustle" }));

    const switchCall = vi
      .mocked(global.fetch)
      .mock.calls.find(([input]) => urlOf(input).includes("/auth/switch-business"));
    expect(switchCall).toBeDefined();
    expect(JSON.parse((switchCall![1] as RequestInit).body as string)).toEqual({ businessId: "b2" });
  });

  it("submits a new business name through the add-business form", async () => {
    mockFetch([
      { id: "b1", name: "Kigali Traders" },
      { id: "b2", name: "Side Hustle" },
    ]);
    const user = userEvent.setup();

    renderSwitcher();

    await user.click(await screen.findByRole("button", { name: /Billa · Kigali Traders/i }));
    await user.click(screen.getByRole("button", { name: /add another business/i }));
    await user.type(screen.getByLabelText("New business name"), "Third Co");
    await user.click(screen.getByRole("button", { name: /^add business$/i }));

    const createCall = vi
      .mocked(global.fetch)
      .mock.calls.find(([input, init]) => urlOf(input).includes("/businesses") && init?.method === "POST");
    expect(createCall).toBeDefined();
    expect(JSON.parse((createCall![1] as RequestInit).body as string)).toEqual({ name: "Third Co" });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/components/BusinessSwitcher.test.tsx`
Expected: FAIL — the component doesn't exist yet.

- [ ] **Step 3: Write the component**

Create `client/src/components/BusinessSwitcher.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { BUSINESS_LIMIT } from "@billa/shared";
import { apiRequest, ApiError } from "../lib/apiClient";
import { useAuth } from "../context/AuthContext";

interface BusinessSummary {
  id: string;
  name: string;
}

export function BusinessSwitcher() {
  const { business } = useAuth();
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    apiRequest<{ businesses: BusinessSummary[] }>("/businesses")
      .then((data) => setBusinesses(data.businesses))
      .catch(() => {});
  }, []);

  async function switchTo(id: string) {
    if (id === business?.id) {
      setIsOpen(false);
      return;
    }
    await apiRequest("/auth/switch-business", { method: "POST", body: { businessId: id } });
    window.location.href = "/dashboard";
  }

  async function addBusiness(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await apiRequest("/businesses", { method: "POST", body: { name: newName } });
      window.location.href = "/dashboard";
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "You've reached the limit of 3 businesses."
          : "Couldn't create that business. Try again.",
      );
      setIsSaving(false);
    }
  }

  const label = `Billa · ${business?.name ?? ""}`;

  if (businesses.length <= 1) {
    return <span className="font-display text-lg font-semibold text-neutral-900">{label}</span>;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="font-display text-lg font-semibold text-neutral-900"
      >
        {label} {isOpen ? "▲" : "▼"}
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
          {businesses.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => switchTo(b.id)}
              className={`block w-full px-3 py-2 text-left font-sans text-sm hover:bg-neutral-50 ${
                b.id === business?.id ? "font-semibold text-primary-700" : "text-neutral-700"
              }`}
            >
              {b.name}
            </button>
          ))}
          {businesses.length < BUSINESS_LIMIT && (
            <>
              <div className="my-1 border-t border-neutral-100" />
              {isAdding ? (
                <form onSubmit={addBusiness} className="flex flex-col gap-2 px-3 py-2">
                  {error && <p className="font-sans text-xs text-error">{error}</p>}
                  <label htmlFor="new-business-name" className="sr-only">
                    New business name
                  </label>
                  <input
                    id="new-business-name"
                    type="text"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    className="rounded border border-neutral-200 px-2 py-1 font-sans text-sm"
                  />
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded bg-primary-500 px-2 py-1 font-sans text-sm text-white disabled:opacity-70"
                  >
                    {isSaving ? "Adding…" : "Add business"}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="block w-full px-3 py-2 text-left font-sans text-sm text-primary-600 hover:bg-neutral-50"
                >
                  + Add another business
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `cd client && npx vitest run src/components/BusinessSwitcher.test.tsx`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Wire it into AppLayout**

In `client/src/components/AppLayout.tsx`, add the import:

```ts
import { BusinessSwitcher } from "./BusinessSwitcher";
```

Replace:

```tsx
          <span className="font-display text-lg font-semibold text-neutral-900">Billa</span>
```

with:

```tsx
          <BusinessSwitcher />
```

- [ ] **Step 6: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors. `AppLayout.test.tsx` should pass unchanged — its mocks already tolerate every fetch call failing, and `BusinessSwitcher` renders the plain-text branch whenever it can't load a business list.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/BusinessSwitcher.tsx client/src/components/BusinessSwitcher.test.tsx client/src/components/AppLayout.tsx
git commit -m "add a business switcher to the header for accounts with multiple businesses"
```

---

### Task 8: Full workspace verification

**Files:** none (verification only)

- [ ] **Step 1: Run every workspace's test suite**

Run: `cd shared && npm test && cd ../server && npm test && cd ../client && npm test`
Expected: all pass.

- [ ] **Step 2: Typecheck every workspace**

Run: `cd shared && npm run typecheck && cd ../server && npm run typecheck && cd ../client && npm run typecheck`
Expected: no errors in any workspace.

- [ ] **Step 3: Real-browser verification**

With both dev servers running:

1. Register a new business. Confirm the header shows plain "Billa" branding with no dropdown (only one business).
2. Note the account's trial status in Settings, then use the header (once it has a switcher) to add a second business named "Side Hustle" via "+ Add another business". Confirm you land in the new business's empty dashboard.
3. Open the header switcher again. Confirm it now lists both businesses, with the current one visually distinguished.
4. Check Settings → Billing in the second business. Confirm the trial/subscription status is identical to the first business (same trial end date) — proving the subscription is account-wide, not per-business.
5. Switch back to the first business via the switcher. Confirm its own documents/customers/items are shown (not the second business's), proving the businessId in the session actually changed.
6. Add a third business, then confirm "+ Add another business" no longer appears once at 3.
7. Try creating a 4th via a direct API call (e.g. browser devtools `fetch("/businesses", {method:"POST", ...})`) and confirm it's rejected with a 409.
8. Check the browser's console and network tab for unexpected errors during all of the above.

- [ ] **Step 4: Fix any issues found**

If real-browser verification finds bugs, fix them, add or update the relevant test(s) to cover what was missed, re-run that test file to confirm it passes, then commit the fix as its own commit.

- [ ] **Step 5: Final confirmation**

Once every workspace's suite passes, every workspace typechecks, and manual verification found no outstanding issues, this stage is done.

---

## Self-review notes

- **Spec coverage:** the ownership flip and account-level subscription (Task 1), the switchable session via `POST /auth/switch-business` (Task 2), creating/listing businesses with the 3-business cap (Task 3), the account-keyed subscription gate and billing (Tasks 4–5), and the header switcher UI with its add-business flow (Task 7) are all covered. The scope decision to exclude teammate invites is reflected throughout — there's no join table, no roles, no invite endpoint anywhere in this plan.
- **Placeholder scan:** no TBD/TODO; every step shows real code or an exact command, except Task 8's real-browser checklist, which is inherently manual.
- **Type consistency:** `SwitchBusinessInput`/`CreateBusinessInput` (Task 2's shared schemas) match exactly what Task 2's `/auth/switch-business` handler and Task 3's `POST /businesses` handler destructure. `issueSession(res, userId, businessId)`'s signature (Task 2) is reused identically by Task 3's `businesses.ts`. The `BusinessSummary` shape in Task 7's `BusinessSwitcher` matches exactly what Task 3's `GET /businesses` returns.
- **Migration note:** Task 1 resets both databases rather than backfilling, since this is pre-launch dev data — consistent with how the Firebase Auth and Billing schema migrations were handled earlier in this project.
