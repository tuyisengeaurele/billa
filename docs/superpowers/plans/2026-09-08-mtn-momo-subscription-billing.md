# MTN MoMo Subscription Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user pay for their Billa subscription (Monthly or Annual) via MTN MoMo, replacing the non-functional Flutterwave checkout entirely.

**Architecture:** Billa uses one single, platform-wide MTN MoMo Collections subscription (read from env vars, not per-business). Checkout reuses the exact `requestToPay`/poll pattern already built and proven for invoice payments: a phone number is submitted, the browser polls a status endpoint every few seconds, and a successful poll extends `currentPeriodEnd`. Flutterwave (`flutterwave.ts`, `/billing/verify`, `/billing/webhook`, `BillingCallback.tsx`) is removed in the same pass.

**Tech Stack:** Express + TypeScript (server), Prisma + PostgreSQL, React 18 + Vite + TypeScript (client), Zod schemas in `shared/`, Vitest + Supertest + Testing Library. Reuses `server/src/lib/momo-client.ts` in full; no new npm dependency anywhere in this plan.

**Spec:** [docs/superpowers/specs/2026-09-08-mtn-momo-subscription-billing-design.md](../specs/2026-09-08-mtn-momo-subscription-billing-design.md)

## Global Constraints

- Billa's own MoMo credentials are read from env vars at request time, never stored in the database. This is different from the invoice-payments feature, where each business's credentials are encrypted and stored per business.
- MTN's sandbox only accepts `EUR` regardless of target market; production uses the real local currency (`RWF`). This is a fact already confirmed by hand against MTN's real sandbox, not a guess: bake it in directly.
- A `PENDING` payment older than 5 minutes is treated as `EXPIRED`, checked lazily on the next poll, not via a scheduled sweep. Polling only, no MTN webhook.
- Idempotency against double-clicks is scoped per `(userId, plan)`: a second checkout call for the same plan while one is already pending returns the existing one; a different plan still creates a new one.
- Flutterwave is removed completely as part of this plan: `server/src/lib/flutterwave.ts`, the `/billing/verify` and `/billing/webhook` routes, `client/src/pages/BillingCallback.tsx` and its route, and the `FLUTTERWAVE_*` env vars.
- No test ever calls MTN's real sandbox.

---

## Task 1: `requireEnv` helper

Every single-account integration in this codebase (`mailer.ts`, `rembg-client.ts`, `flutterwave.ts`, `encryption.ts`) repeats the same "read an env var, throw a clear error if it's missing" check inline. This plan needs that check five more times (`MOMO_BILLING_SUBSCRIPTION_KEY`, `MOMO_BILLING_API_USER`, `MOMO_BILLING_API_KEY`, `MOMO_BILLING_ENVIRONMENT`, `MOMO_BILLING_TARGET_ENVIRONMENT`), a good point to factor it into one reusable helper rather than copy-pasting a sixth time.

**Files:**
- Create: `server/src/lib/require-env.ts`
- Create: `server/src/lib/require-env.test.ts`

**Interfaces:**
- Produces: `requireEnv(name: string): string`, throws `Error(`${name} is not set`)` when unset or empty. Task 3 depends on this exact name and error-message format.

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/require-env.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { requireEnv } from "./require-env.js";

describe("requireEnv", () => {
  afterEach(() => {
    delete process.env.SOME_TEST_VAR;
  });

  it("returns the value when the env var is set", () => {
    process.env.SOME_TEST_VAR = "a-value";

    expect(requireEnv("SOME_TEST_VAR")).toBe("a-value");
  });

  it("throws a clear error naming the missing var", () => {
    delete process.env.SOME_TEST_VAR;

    expect(() => requireEnv("SOME_TEST_VAR")).toThrow("SOME_TEST_VAR is not set");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd server && npx vitest run src/lib/require-env.test.ts
```

Expected: FAIL (the module doesn't exist yet).

- [ ] **Step 3: Implement the helper**

Create `server/src/lib/require-env.ts`:

```ts
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}
```

- [ ] **Step 4: Run it again to confirm it passes**

```bash
cd server && npx vitest run src/lib/require-env.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
cd server && npm run typecheck
git add server/src/lib/require-env.ts server/src/lib/require-env.test.ts
git commit -m "add requireEnv helper"
git push origin master
```

---

## Task 2: Prisma schema changes

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: a new Prisma migration under `server/prisma/migrations/`

**Interfaces:**
- Produces: `Payment.phoneNumber: string`, `Payment.failureReason: string | null`, `PaymentStatus` gains `EXPIRED`. `Payment.flutterwaveTxId` is removed. Task 5 depends on all of these.

- [ ] **Step 1: Update the `PaymentStatus` enum**

In `server/prisma/schema.prisma`, find:

```prisma
enum PaymentStatus {
  PENDING
  SUCCESSFUL
  FAILED
}
```

Change to:

```prisma
enum PaymentStatus {
  PENDING
  SUCCESSFUL
  FAILED
  EXPIRED
}
```

- [ ] **Step 2: Update the `Payment` model**

Find:

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

Replace with:

```prisma
model Payment {
  id            String           @id @default(cuid())
  userId        String
  plan          SubscriptionPlan
  amount        Int
  currency      String
  txRef         String           @unique
  phoneNumber   String
  status        PaymentStatus    @default(PENDING)
  failureReason String?
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
}
```

- [ ] **Step 3: Clear the (dev-only, Flutterwave-era) `Payment` table before migrating**

The new `phoneNumber` column is required, and existing local `Payment` rows from earlier Flutterwave testing have no valid value to backfill it with. None of this data is real, it's local dev/test data from a payment provider that never worked. Clear it before the migration:

```bash
cd server && PGPASSWORD='YOUR_LOCAL_DB_PASSWORD' psql -h localhost -U postgres -d billa -c 'DELETE FROM "Payment";'
```

- [ ] **Step 4: Generate the migration**

`prisma migrate dev` doesn't work non-interactively in this environment. Use the diff-based workaround:

```bash
cd server
npx prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema.prisma --script > /tmp/billing_migration.sql
cat /tmp/billing_migration.sql
```

Read the output to confirm it drops `flutterwaveTxId`, adds `phoneNumber` (NOT NULL) and `failureReason`, and adds `EXPIRED` to the `PaymentStatus` enum. Then:

```bash
TS=$(date -u +%Y%m%d%H%M%S)
DIR="prisma/migrations/${TS}_momo_subscription_billing"
mkdir -p "$DIR"
cp /tmp/billing_migration.sql "$DIR/migration.sql"
```

- [ ] **Step 5: Apply it to the dev database**

```bash
cd server && npx prisma migrate deploy
```

Expected: "All migrations have been successfully applied."

- [ ] **Step 6: Apply it to the test database**

```bash
cd server && DATABASE_URL="postgresql://postgres:YOUR_LOCAL_DB_PASSWORD@localhost:5432/billa_test" npx prisma migrate deploy
```

- [ ] **Step 7: Regenerate the Prisma client**

```bash
cd server && npx prisma generate
```

- [ ] **Step 8: Run the full server test suite to confirm nothing broke**

```bash
cd server && npm test
```

Expected: every existing suite still passes except the three Flutterwave-specific billing test files, which are expected to fail now (they reference `flutterwaveTxId` and `flutterwave.js`, both gone). Confirm the *only* failures are in `billing.checkout.test.ts`, `billing.verify.test.ts`, and `billing.webhook.test.ts`, Task 5 replaces all three.

- [ ] **Step 9: Typecheck and commit**

```bash
cd server && npm run typecheck
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "update Payment schema for MoMo subscription billing"
git push origin master
```

(`npm run typecheck` will also fail here, `billing.ts` still references `flutterwaveTxId` and `flutterwave.js` until Task 5. That's expected and gets fixed there; commit the schema change on its own regardless, since the schema and the route rewrite are separable review units.)

---

## Task 3: Billa's own MoMo billing credentials and currency

**Files:**
- Create: `server/src/lib/billing-momo.ts`
- Create: `server/src/lib/billing-momo.test.ts`

**Interfaces:**
- Consumes: `requireEnv` (Task 1); `MomoCredentials`, `MOMO_BASE_URLS` from `../lib/momo-client.js` (existing).
- Produces: `getBillingMomoConfig(): { credentials: MomoCredentials; currency: string }`. Task 5 depends on this exact name and shape.

- [ ] **Step 1: Write the failing tests**

Create `server/src/lib/billing-momo.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { getBillingMomoConfig } from "./billing-momo.js";
import { MOMO_BASE_URLS } from "./momo-client.js";

const ALL_VARS = [
  "MOMO_BILLING_SUBSCRIPTION_KEY",
  "MOMO_BILLING_API_USER",
  "MOMO_BILLING_API_KEY",
  "MOMO_BILLING_ENVIRONMENT",
  "MOMO_BILLING_TARGET_ENVIRONMENT",
];

function setSandboxEnv() {
  process.env.MOMO_BILLING_SUBSCRIPTION_KEY = "sub-key";
  process.env.MOMO_BILLING_API_USER = "api-user";
  process.env.MOMO_BILLING_API_KEY = "api-key";
  process.env.MOMO_BILLING_ENVIRONMENT = "sandbox";
}

describe("getBillingMomoConfig", () => {
  beforeEach(() => {
    for (const key of ALL_VARS) delete process.env[key];
  });

  it("builds sandbox credentials with EUR and the sandbox base URL", () => {
    setSandboxEnv();

    const { credentials, currency } = getBillingMomoConfig();

    expect(currency).toBe("EUR");
    expect(credentials).toEqual({
      subscriptionKey: "sub-key",
      apiUser: "api-user",
      apiKey: "api-key",
      targetEnvironment: "sandbox",
      baseUrl: MOMO_BASE_URLS.sandbox,
    });
  });

  it("builds production credentials with RWF, the production base URL, and the configured target environment", () => {
    setSandboxEnv();
    process.env.MOMO_BILLING_ENVIRONMENT = "production";
    process.env.MOMO_BILLING_TARGET_ENVIRONMENT = "live-target";

    const { credentials, currency } = getBillingMomoConfig();

    expect(currency).toBe("RWF");
    expect(credentials.targetEnvironment).toBe("live-target");
    expect(credentials.baseUrl).toBe(MOMO_BASE_URLS.production);
  });

  it("throws when a required credential is missing", () => {
    setSandboxEnv();
    delete process.env.MOMO_BILLING_SUBSCRIPTION_KEY;

    expect(() => getBillingMomoConfig()).toThrow("MOMO_BILLING_SUBSCRIPTION_KEY is not set");
  });

  it("throws in production when the target environment isn't set", () => {
    setSandboxEnv();
    process.env.MOMO_BILLING_ENVIRONMENT = "production";

    expect(() => getBillingMomoConfig()).toThrow("MOMO_BILLING_TARGET_ENVIRONMENT is not set");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd server && npx vitest run src/lib/billing-momo.test.ts
```

Expected: FAIL (the module doesn't exist yet).

- [ ] **Step 3: Implement it**

Create `server/src/lib/billing-momo.ts`:

```ts
import type { MomoCredentials } from "./momo-client.js";
import { MOMO_BASE_URLS } from "./momo-client.js";
import { requireEnv } from "./require-env.js";

export function getBillingMomoConfig(): { credentials: MomoCredentials; currency: string } {
  const environment = requireEnv("MOMO_BILLING_ENVIRONMENT") as "sandbox" | "production";
  const targetEnvironment = environment === "sandbox" ? "sandbox" : requireEnv("MOMO_BILLING_TARGET_ENVIRONMENT");

  const credentials: MomoCredentials = {
    subscriptionKey: requireEnv("MOMO_BILLING_SUBSCRIPTION_KEY"),
    apiUser: requireEnv("MOMO_BILLING_API_USER"),
    apiKey: requireEnv("MOMO_BILLING_API_KEY"),
    targetEnvironment,
    baseUrl: MOMO_BASE_URLS[environment],
  };
  const currency = environment === "sandbox" ? "EUR" : "RWF";

  return { credentials, currency };
}
```

- [ ] **Step 4: Run it again to confirm it passes**

```bash
cd server && npx vitest run src/lib/billing-momo.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
cd server && npm run typecheck
git add server/src/lib/billing-momo.ts server/src/lib/billing-momo.test.ts
git commit -m "add Billa's own MoMo billing credentials and currency selection"
git push origin master
```

---

## Task 4: Shared schema update

**Files:**
- Modify: `shared/src/billing-schemas.ts`
- Modify: `shared/src/billing-schemas.test.ts`

**Interfaces:**
- Produces: `billingCheckoutSchema` now requires `phoneNumber`; `BillingCheckoutInput` gains `phoneNumber: string`. `billingVerifySchema`/`BillingVerifyInput` are removed (Flutterwave-only). Task 5 depends on the new `billingCheckoutSchema` shape.

- [ ] **Step 1: Read the existing test file**

```bash
cat shared/src/billing-schemas.test.ts
```

Look for any test covering `billingVerifySchema`, it will need removing alongside the schema itself.

- [ ] **Step 2: Update the schema**

In `shared/src/billing-schemas.ts`, replace the whole file with:

```ts
import { z } from "zod";

export const billingCheckoutSchema = z.object({
  plan: z.enum(["MONTHLY", "ANNUAL"]),
  phoneNumber: z.string().trim().min(9, "Enter a valid phone number").max(15, "Enter a valid phone number"),
});
export type BillingCheckoutInput = z.infer<typeof billingCheckoutSchema>;

export const PLAN_PRICES: Record<"MONTHLY" | "ANNUAL", number> = {
  MONTHLY: 6500,
  ANNUAL: 65000,
};
```

- [ ] **Step 3: Update the test file**

Remove any `billingVerifySchema` tests from `shared/src/billing-schemas.test.ts`, and add a case for the new required field:

```ts
import { describe, expect, it } from "vitest";
import { billingCheckoutSchema } from "./billing-schemas.js";

describe("billingCheckoutSchema", () => {
  it("accepts a plan and a phone number", () => {
    const result = billingCheckoutSchema.safeParse({ plan: "MONTHLY", phoneNumber: "250788000000" });

    expect(result.success).toBe(true);
  });

  it("rejects a missing phone number", () => {
    const result = billingCheckoutSchema.safeParse({ plan: "MONTHLY" });

    expect(result.success).toBe(false);
  });

  it("rejects an unknown plan", () => {
    const result = billingCheckoutSchema.safeParse({ plan: "WEEKLY", phoneNumber: "250788000000" });

    expect(result.success).toBe(false);
  });
});
```

(Keep any other pre-existing, still-relevant cases from the file as they were, only remove ones that reference `billingVerifySchema`.)

- [ ] **Step 4: Run it to confirm it passes**

```bash
cd shared && npx vitest run src/billing-schemas.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
cd shared && npm run typecheck
git add shared/src/billing-schemas.ts shared/src/billing-schemas.test.ts
git commit -m "require a phone number for billing checkout, drop Flutterwave-only verify schema"
git push origin master
```

---

## Task 5: Server routes, remove Flutterwave, add the MoMo checkout and poll routes

**Files:**
- Modify: `server/src/routes/billing.ts`
- Delete: `server/src/lib/flutterwave.ts`
- Modify: `server/src/routes/billing.checkout.test.ts` (rewritten)
- Create: `server/src/routes/billing.checkout-poll.test.ts`
- Delete: `server/src/routes/billing.verify.test.ts`
- Delete: `server/src/routes/billing.webhook.test.ts`

**Interfaces:**
- Consumes: `billingCheckoutSchema`, `PLAN_PRICES` from `@billa/shared` (Task 4); `getBillingMomoConfig` from `../lib/billing-momo.js` (Task 3); `getAccessToken`, `requestToPay`, `getRequestToPayStatus` from `../lib/momo-client.js` (existing).
- Produces: `POST /billing/checkout` → `{ paymentId: string }`; `GET /billing/checkout/:paymentId` → `{ status: "PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED", failureReason?: string | null }`. `GET /billing/status` unchanged. `POST /billing/verify` and `POST /billing/webhook` no longer exist. Task 6 (client) depends on the checkout and poll response shapes exactly.

- [ ] **Step 1: Write the failing tests for the new checkout route**

Replace the entire contents of `server/src/routes/billing.checkout.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";
import * as momoClientModule from "../lib/momo-client.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
  process.env.MOMO_BILLING_SUBSCRIPTION_KEY ??= "test-sub-key";
  process.env.MOMO_BILLING_API_USER ??= "test-api-user";
  process.env.MOMO_BILLING_API_KEY ??= "test-api-key";
  process.env.MOMO_BILLING_ENVIRONMENT ??= "sandbox";
});

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
});

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

describe("POST /billing/checkout", () => {
  it("creates a pending payment and calls MTN with the sandbox currency", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
    const requestToPaySpy = vi.spyOn(momoClientModule, "requestToPay").mockResolvedValue(undefined);

    const res = await request(app)
      .post("/billing/checkout")
      .set("Cookie", cookies)
      .send({ plan: "MONTHLY", phoneNumber: "250788000000" });

    expect(res.status).toBe(201);
    expect(res.body.paymentId).toBeTruthy();
    expect(requestToPaySpy).toHaveBeenCalledWith(
      expect.anything(),
      "token-123",
      expect.objectContaining({ currency: "EUR", amount: 6500 }),
    );

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: res.body.paymentId } });
    expect(payment.status).toBe("PENDING");
    expect(payment.amount).toBe(6500);
    expect(payment.currency).toBe("RWF");
  });

  it("returns the existing pending payment for the same plan instead of creating a second one", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
    const requestToPaySpy = vi.spyOn(momoClientModule, "requestToPay").mockResolvedValue(undefined);

    const first = await request(app)
      .post("/billing/checkout")
      .set("Cookie", cookies)
      .send({ plan: "MONTHLY", phoneNumber: "250788000000" });
    const second = await request(app)
      .post("/billing/checkout")
      .set("Cookie", cookies)
      .send({ plan: "MONTHLY", phoneNumber: "250788000000" });

    expect(second.body.paymentId).toBe(first.body.paymentId);
    expect(requestToPaySpy).toHaveBeenCalledTimes(1);
  });

  it("creates a separate payment for a different plan even while one is pending", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
    vi.spyOn(momoClientModule, "requestToPay").mockResolvedValue(undefined);

    const monthly = await request(app)
      .post("/billing/checkout")
      .set("Cookie", cookies)
      .send({ plan: "MONTHLY", phoneNumber: "250788000000" });
    const annual = await request(app)
      .post("/billing/checkout")
      .set("Cookie", cookies)
      .send({ plan: "ANNUAL", phoneNumber: "250788000000" });

    expect(annual.body.paymentId).not.toBe(monthly.body.paymentId);
  });

  it("marks the payment FAILED when the MTN call itself fails", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
    vi.spyOn(momoClientModule, "requestToPay").mockRejectedValue(new Error("insufficient funds"));

    const res = await request(app)
      .post("/billing/checkout")
      .set("Cookie", cookies)
      .send({ plan: "MONTHLY", phoneNumber: "250788000000" });

    expect(res.status).toBe(502);
    const payment = await prisma.payment.findFirstOrThrow({});
    expect(payment.status).toBe("FAILED");
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp())
      .post("/billing/checkout")
      .send({ plan: "MONTHLY", phoneNumber: "250788000000" });

    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Write the failing tests for the new poll route**

Create `server/src/routes/billing.checkout-poll.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "../test/db.js";
import * as momoClientModule from "../lib/momo-client.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
  process.env.MOMO_BILLING_SUBSCRIPTION_KEY ??= "test-sub-key";
  process.env.MOMO_BILLING_API_USER ??= "test-api-user";
  process.env.MOMO_BILLING_API_KEY ??= "test-api-key";
  process.env.MOMO_BILLING_ENVIRONMENT ??= "sandbox";
});

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
});

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return { cookies: res.headers["set-cookie"] as unknown as string[], userId: res.body.user.id as string };
}

async function createPendingCheckout(
  app: ReturnType<typeof createApp>,
  cookies: string[],
  plan: "MONTHLY" | "ANNUAL" = "MONTHLY",
) {
  vi.spyOn(momoClientModule, "getAccessToken").mockResolvedValue("token-123");
  vi.spyOn(momoClientModule, "requestToPay").mockResolvedValue(undefined);
  const res = await request(app)
    .post("/billing/checkout")
    .set("Cookie", cookies)
    .send({ plan, phoneNumber: "250788000000" });
  return res.body.paymentId as string;
}

describe("GET /billing/checkout/:paymentId", () => {
  it("returns PENDING while MTN hasn't resolved the request", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app);
    const paymentId = await createPendingCheckout(app, cookies);
    vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({ status: "PENDING" });

    const res = await request(app).get(`/billing/checkout/${paymentId}`).set("Cookie", cookies);

    expect(res.body).toEqual({ status: "PENDING" });
  });

  it("extends currentPeriodEnd and marks the payment SUCCESSFUL once MTN confirms it", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app);
    const paymentId = await createPendingCheckout(app, cookies);
    vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({ status: "SUCCESSFUL" });

    const res = await request(app).get(`/billing/checkout/${paymentId}`).set("Cookie", cookies);

    expect(res.body).toEqual({ status: "SUCCESSFUL" });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.plan).toBe("MONTHLY");
    expect(user.currentPeriodEnd).not.toBeNull();
    expect(user.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now());

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe("SUCCESSFUL");
  });

  it("stacks a renewal on top of remaining time instead of resetting it", async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndGetCookies(app);
    const futureEnd = new Date(Date.now() + 1000 * 60 * 60 * 24 * 10);
    await prisma.user.update({ where: { id: userId }, data: { currentPeriodEnd: futureEnd, plan: "MONTHLY" } });
    const paymentId = await createPendingCheckout(app, cookies);
    vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({ status: "SUCCESSFUL" });

    await request(app).get(`/billing/checkout/${paymentId}`).set("Cookie", cookies);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const expectedEnd = futureEnd.getTime() + 30 * 24 * 60 * 60 * 1000;
    expect(user.currentPeriodEnd!.getTime()).toBe(expectedEnd);
  });

  it("stores the failure reason and marks the payment FAILED", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app);
    const paymentId = await createPendingCheckout(app, cookies);
    vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({
      status: "FAILED",
      reason: "PAYER_NOT_FOUND",
    });

    const res = await request(app).get(`/billing/checkout/${paymentId}`).set("Cookie", cookies);

    expect(res.body).toEqual({ status: "FAILED", failureReason: "PAYER_NOT_FOUND" });
  });

  it("does not call MTN again once the payment is already terminal", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app);
    const paymentId = await createPendingCheckout(app, cookies);
    const statusSpy = vi.spyOn(momoClientModule, "getRequestToPayStatus").mockResolvedValue({ status: "SUCCESSFUL" });

    await request(app).get(`/billing/checkout/${paymentId}`).set("Cookie", cookies);
    await request(app).get(`/billing/checkout/${paymentId}`).set("Cookie", cookies);

    expect(statusSpy).toHaveBeenCalledTimes(1);
  });

  it("marks a stale pending payment EXPIRED without calling MTN", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app);
    const paymentId = await createPendingCheckout(app, cookies);
    await prisma.payment.update({
      where: { id: paymentId },
      data: { createdAt: new Date(Date.now() - 6 * 60 * 1000) },
    });
    const statusSpy = vi.spyOn(momoClientModule, "getRequestToPayStatus");

    const res = await request(app).get(`/billing/checkout/${paymentId}`).set("Cookie", cookies);

    expect(res.body).toEqual({ status: "EXPIRED" });
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it("returns 404 for a payment belonging to another account", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app);
    const paymentId = await createPendingCheckout(app, cookies);

    const otherRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).get(`/billing/checkout/${paymentId}`).set("Cookie", otherCookies);

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Delete the Flutterwave-only test files**

```bash
rm server/src/routes/billing.verify.test.ts server/src/routes/billing.webhook.test.ts
```

- [ ] **Step 4: Run the new tests to confirm they fail**

```bash
cd server && npx vitest run src/routes/billing.checkout.test.ts src/routes/billing.checkout-poll.test.ts
```

Expected: FAIL (the routes still use Flutterwave and the old shapes).

- [ ] **Step 5: Rewrite `billing.ts`**

Replace the entire contents of `server/src/routes/billing.ts`:

```ts
import crypto from "node:crypto";
import { Router } from "express";
import { billingCheckoutSchema, PLAN_PRICES } from "@billa/shared";
import type { BillingCheckoutInput } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate.js";
import { getBillingMomoConfig } from "../lib/billing-momo.js";
import { getAccessToken, getRequestToPayStatus, requestToPay } from "../lib/momo-client.js";

export const billingRouter = Router();

const PLAN_DAYS: Record<"MONTHLY" | "ANNUAL", number> = { MONTHLY: 30, ANNUAL: 365 };
const MOMO_EXPIRY_MS = 5 * 60 * 1000;

billingRouter.post("/checkout", requireAuth, validateBody(billingCheckoutSchema), async (req, res) => {
  const { plan, phoneNumber } = req.body as BillingCheckoutInput;
  const userId = req.auth!.userId;

  const existing = await prisma.payment.findFirst({
    where: { userId, plan, status: "PENDING", createdAt: { gt: new Date(Date.now() - MOMO_EXPIRY_MS) } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    res.status(201).json({ paymentId: existing.id });
    return;
  }

  const txRef = `billa-${userId}-${crypto.randomUUID()}`;
  const payment = await prisma.payment.create({
    data: { userId, plan, amount: PLAN_PRICES[plan], currency: "RWF", txRef, phoneNumber, status: "PENDING" },
  });

  const { credentials, currency } = getBillingMomoConfig();
  try {
    const token = await getAccessToken(credentials);
    await requestToPay(credentials, token, {
      referenceId: txRef,
      amount: PLAN_PRICES[plan],
      currency,
      phoneNumber,
      externalId: payment.id,
      payerMessage: `Billa ${plan === "MONTHLY" ? "monthly" : "annual"} subscription`,
      payeeNote: `Billa subscription (${payment.id})`,
    });
  } catch (err) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: err instanceof Error ? err.message : "Unknown error" },
    });
    res.status(502).json({ error: "momo_request_failed" });
    return;
  }

  res.status(201).json({ paymentId: payment.id });
});

billingRouter.get("/checkout/:paymentId", requireAuth, async (req, res) => {
  const { paymentId } = req.params;
  const userId = req.auth!.userId;

  const payment = await prisma.payment.findFirst({ where: { id: paymentId, userId } });
  if (!payment) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  if (payment.status !== "PENDING") {
    res.json({ status: payment.status, failureReason: payment.failureReason });
    return;
  }

  if (Date.now() - payment.createdAt.getTime() > MOMO_EXPIRY_MS) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "EXPIRED" } });
    res.json({ status: "EXPIRED" });
    return;
  }

  const { credentials } = getBillingMomoConfig();
  let mtnStatus: { status: "PENDING" | "SUCCESSFUL" | "FAILED"; reason?: string };
  try {
    const token = await getAccessToken(credentials);
    mtnStatus = await getRequestToPayStatus(credentials, token, payment.txRef);
  } catch {
    res.json({ status: "PENDING" });
    return;
  }

  if (mtnStatus.status === "PENDING") {
    res.json({ status: "PENDING" });
    return;
  }

  if (mtnStatus.status === "FAILED") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: mtnStatus.reason ?? null },
    });
    res.json({ status: "FAILED", failureReason: mtnStatus.reason ?? null });
    return;
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const now = new Date();
  const base = user.currentPeriodEnd && user.currentPeriodEnd > now ? user.currentPeriodEnd : now;
  const currentPeriodEnd = new Date(base.getTime() + PLAN_DAYS[payment.plan] * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.payment.update({ where: { id: payment.id }, data: { status: "SUCCESSFUL" } }),
    prisma.user.update({ where: { id: userId }, data: { currentPeriodEnd, plan: payment.plan } }),
  ]);

  res.json({ status: "SUCCESSFUL" });
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

- [ ] **Step 6: Delete the Flutterwave client library**

```bash
rm server/src/lib/flutterwave.ts
```

- [ ] **Step 7: Run the new tests to confirm they pass**

```bash
cd server && npx vitest run src/routes/billing.checkout.test.ts src/routes/billing.checkout-poll.test.ts src/routes/billing.status.test.ts
```

Expected: PASS. (`billing.status.test.ts` is untouched by this task and should keep passing unchanged, confirming `/billing/status` still works exactly as before.)

- [ ] **Step 8: Remove the Flutterwave env vars, add the MoMo billing ones**

In `server/.env.example`, remove:

```
# Flutterwave (Settings -> API Keys for the secret key; Settings -> Webhooks for the hash)
FLUTTERWAVE_SECRET_KEY="FLWSECK_TEST-your-test-secret-key"
FLUTTERWAVE_WEBHOOK_HASH="a-secret-string-you-choose-and-also-set-in-the-flutterwave-dashboard"
```

Add in its place:

```
# Billa's own MTN Mobile Money account (used for subscription billing, NOT the
# per-business credentials businesses enter in their own Business Settings).
MOMO_BILLING_SUBSCRIPTION_KEY="your-subscription-key"
MOMO_BILLING_API_USER="your-api-user-id"
MOMO_BILLING_API_KEY="your-api-key"
MOMO_BILLING_ENVIRONMENT="sandbox"
# Only required when MOMO_BILLING_ENVIRONMENT is "production".
MOMO_BILLING_TARGET_ENVIRONMENT=""
```

- [ ] **Step 9: Run the full server test suite**

```bash
cd server && npm test
```

Expected: every suite passes, no Flutterwave reference remains anywhere.

```bash
cd server && grep -rn "flutterwave\|Flutterwave\|FLUTTERWAVE" src/ .env.example
```

Expected: no output.

- [ ] **Step 10: Typecheck and commit**

```bash
cd server && npm run typecheck
git add server/src/routes/billing.ts server/src/routes/billing.checkout.test.ts server/src/routes/billing.checkout-poll.test.ts server/.env.example
git rm server/src/lib/flutterwave.ts server/src/routes/billing.verify.test.ts server/src/routes/billing.webhook.test.ts
git commit -m "replace Flutterwave subscription checkout with MTN MoMo"
git push origin master
```

---

## Task 6: Client, redesign `BillingSection`

**Files:**
- Modify: `client/src/components/business/BillingSection.tsx`
- Create: `client/src/components/business/BillingSection.test.tsx`

**Interfaces:**
- Consumes: `apiRequest`, `ApiError` from `../../lib/apiClient`; `useAuth` from `../../context/AuthContext` (for `user.phone`); `PLAN_PRICES` and `formatRwf` from `@billa/shared`; `POST /billing/checkout` and `GET /billing/checkout/:paymentId` (Task 5).
- Produces: `BillingSection` component, unchanged export name and unchanged place in `BusinessSettings.tsx` (no wiring change needed there).

- [ ] **Step 1: Write the failing tests**

Create `client/src/components/business/BillingSection.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import { BillingSection } from "./BillingSection";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

interface MockOverrides {
  status?: unknown;
  onPoll?: (call: number) => unknown;
}

function mockFetch(overrides: MockOverrides = {}) {
  let pollCalls = 0;
  vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = urlOf(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/auth/me")) {
      return new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com", phone: "+250788000000" },
          business: { id: "b1", name: "Kigali Traders" },
        }),
        { status: 200 },
      );
    }
    if (url.endsWith("/billing/status") && method === "GET") {
      return new Response(
        JSON.stringify(
          overrides.status ?? {
            trialEndsAt: new Date(Date.now() + 86400000).toISOString(),
            currentPeriodEnd: null,
            plan: null,
            activeUntil: new Date(Date.now() + 86400000).toISOString(),
          },
        ),
        { status: 200 },
      );
    }
    if (url.endsWith("/billing/checkout") && method === "POST") {
      return new Response(JSON.stringify({ paymentId: "pay1" }), { status: 201 });
    }
    if (url.includes("/billing/checkout/") && method === "GET") {
      pollCalls += 1;
      return new Response(JSON.stringify(overrides.onPoll ? overrides.onPoll(pollCalls) : { status: "PENDING" }), {
        status: 200,
      });
    }
    return new Response("{}", { status: 401 });
  });
}

describe("BillingSection", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("pre-fills the phone number from the user's profile", async () => {
    mockFetch();

    render(
      <AuthProvider>
        <BillingSection />
      </AuthProvider>,
    );

    expect(await screen.findByLabelText(/mtn momo phone number/i)).toHaveValue("+250788000000");
  });

  it("submits a checkout and shows the pending state", async () => {
    mockFetch();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <AuthProvider>
        <BillingSection />
      </AuthProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /pay 6,500 rwf \(monthly\)/i }));

    expect(await screen.findByText(/check your phone to approve/i)).toBeInTheDocument();
  });

  it("shows a success message once MTN confirms the payment", async () => {
    mockFetch({ onPoll: (call) => ({ status: call < 2 ? "PENDING" : "SUCCESSFUL" }) });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <AuthProvider>
        <BillingSection />
      </AuthProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /pay 6,500 rwf \(monthly\)/i }));
    await screen.findByText(/check your phone to approve/i);

    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);

    expect(await screen.findByText(/payment received/i)).toBeInTheDocument();
  });

  it("shows a failure message and offers to try again", async () => {
    mockFetch({ onPoll: () => ({ status: "FAILED", failureReason: "Payer rejected" }) });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <AuthProvider>
        <BillingSection />
      </AuthProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /pay 6,500 rwf \(monthly\)/i }));
    await vi.advanceTimersByTimeAsync(3000);

    expect(await screen.findByText("Payer rejected")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd client && npx vitest run src/components/business/BillingSection.test.tsx
```

Expected: FAIL (the current component has no phone field or pay buttons in this shape).

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `client/src/components/business/BillingSection.tsx`:

```tsx
import { useEffect, useState } from "react";
import { PLAN_PRICES, formatRwf } from "@billa/shared";
import { apiRequest, ApiError } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { LoadErrorBanner } from "../LoadErrorBanner";
import { Spinner } from "../Spinner";

interface BillingStatus {
  trialEndsAt: string;
  currentPeriodEnd: string | null;
  plan: "MONTHLY" | "ANNUAL" | null;
  activeUntil: string;
}

const PLAN_LABELS: Record<"MONTHLY" | "ANNUAL", string> = {
  MONTHLY: `Monthly (${formatRwf(PLAN_PRICES.MONTHLY)})`,
  ANNUAL: `Annual (${formatRwf(PLAN_PRICES.ANNUAL)})`,
};

export function BillingSection() {
  const { user } = useAuth();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [payingPlan, setPayingPlan] = useState<"MONTHLY" | "ANNUAL" | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED" | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(false);
    apiRequest<BillingStatus>("/billing/status")
      .then(setStatus)
      .catch(() => setLoadError(true));
  }, [reloadToken]);

  useEffect(() => {
    if (user?.phone) setPhoneNumber(user.phone);
  }, [user]);

  useEffect(() => {
    if (!paymentId || paymentStatus !== "PENDING") return;
    const interval = setInterval(async () => {
      try {
        const data = await apiRequest<{
          status: "PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED";
          failureReason?: string | null;
        }>(`/billing/checkout/${paymentId}`);
        setPaymentStatus(data.status);
        setFailureReason(data.failureReason ?? null);
        if (data.status === "SUCCESSFUL") {
          setReloadToken((t) => t + 1);
        }
      } catch {
        // transient network error, keep polling on the next tick
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [paymentId, paymentStatus]);

  async function subscribe(plan: "MONTHLY" | "ANNUAL") {
    setCheckoutError(null);
    setPayingPlan(plan);
    try {
      const data = await apiRequest<{ paymentId: string }>("/billing/checkout", {
        method: "POST",
        body: { plan, phoneNumber },
      });
      setPaymentId(data.paymentId);
      setPaymentStatus("PENDING");
    } catch (err) {
      setCheckoutError(
        err instanceof ApiError
          ? "Couldn't start the payment. Check the number and try again."
          : "Something went wrong. Try again.",
      );
      setPayingPlan(null);
    }
  }

  function retry() {
    setPaymentId(null);
    setPaymentStatus(null);
    setFailureReason(null);
    setPayingPlan(null);
    setCheckoutError(null);
  }

  if (loadError) {
    return (
      <LoadErrorBanner message="Couldn't load your billing status." onRetry={() => setReloadToken((t) => t + 1)} />
    );
  }

  if (!status) {
    return <Spinner />;
  }

  const isActive = new Date(status.activeUntil).getTime() > Date.now();
  const statusText = status.plan
    ? `${PLAN_LABELS[status.plan]}, ${isActive ? "active" : "expired"} until ${new Date(status.activeUntil).toLocaleDateString()}`
    : isActive
      ? `Free trial, active until ${new Date(status.activeUntil).toLocaleDateString()}`
      : "Your free trial has ended.";

  return (
    <section className="rounded-xl border border-neutral-200 bg-surface p-6">
      <h2 className="font-display text-base font-semibold text-neutral-900">Billing</h2>

      {checkoutError && (
        <div className="mt-4 rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          {checkoutError}
        </div>
      )}

      <p className="mt-4 font-sans text-sm text-neutral-600">{statusText}</p>

      {!paymentStatus && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="billingPhone" className="font-sans text-sm font-medium text-neutral-800">
              MTN MoMo phone number
            </label>
            <input
              id="billingPhone"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="rounded-lg border border-neutral-200 bg-surface px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={payingPlan !== null || !phoneNumber.trim()}
              onClick={() => subscribe("MONTHLY")}
              className="rounded-lg bg-primary-500 px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {payingPlan === "MONTHLY" ? "Sending…" : `Pay ${formatRwf(PLAN_PRICES.MONTHLY)} (Monthly)`}
            </button>
            <button
              type="button"
              disabled={payingPlan !== null || !phoneNumber.trim()}
              onClick={() => subscribe("ANNUAL")}
              className="rounded-lg border border-neutral-200 px-5 py-2.5 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {payingPlan === "ANNUAL" ? "Sending…" : `Pay ${formatRwf(PLAN_PRICES.ANNUAL)} (Annual)`}
            </button>
          </div>
        </div>
      )}

      {paymentStatus === "PENDING" && (
        <div className="mt-4 flex items-center gap-2">
          <Spinner size="sm" />
          <p className="font-sans text-sm text-neutral-600">Check your phone to approve this payment.</p>
        </div>
      )}

      {paymentStatus === "SUCCESSFUL" && (
        <p className="mt-4 font-sans text-sm font-medium text-primary-700">
          Payment received. Thank you for subscribing.
        </p>
      )}

      {(paymentStatus === "FAILED" || paymentStatus === "EXPIRED") && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="font-sans text-sm text-error">
            {paymentStatus === "EXPIRED"
              ? "This payment request expired before it was approved."
              : (failureReason ?? "The payment didn't go through.")}
          </p>
          <button
            type="button"
            onClick={retry}
            className="w-fit rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Try again
          </button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run it again to confirm it passes**

```bash
cd client && npx vitest run src/components/business/BillingSection.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
cd client && npm run typecheck
git add client/src/components/business/BillingSection.tsx client/src/components/business/BillingSection.test.tsx
git commit -m "replace redirect checkout with inline MTN MoMo payment in BillingSection"
git push origin master
```

---

## Task 7: Remove `BillingCallback`

**Files:**
- Delete: `client/src/pages/BillingCallback.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Produces: no route at `/billing/callback` anymore. Nothing depends on this route existing; `BillingSection` never redirects there.

- [ ] **Step 1: Remove the lazy import**

In `client/src/App.tsx`, remove this line:

```tsx
const BillingCallback = lazy(() => import("./pages/BillingCallback"));
```

- [ ] **Step 2: Remove the route**

Remove this line:

```tsx
<Route path="/billing/callback" element={<BillingCallback />} />
```

- [ ] **Step 3: Delete the page**

```bash
rm client/src/pages/BillingCallback.tsx
```

- [ ] **Step 4: Confirm nothing else references it**

```bash
cd client && grep -rn "BillingCallback\|billing/callback" src/
```

Expected: no output.

- [ ] **Step 5: Typecheck and commit**

```bash
cd client && npm run typecheck
git add client/src/App.tsx
git rm client/src/pages/BillingCallback.tsx
git commit -m "remove the Flutterwave billing callback page"
git push origin master
```

---

## Task 8: Full-suite verification and rollout notes

**Files:** none new, verification and documentation only.

- [ ] **Step 1: Run the full server test suite**

```bash
cd server && npm test
```

Expected: every suite passes, including all the ones touched or added in this plan, and no Flutterwave-related failures remain.

- [ ] **Step 2: Run the full client test suite**

```bash
cd client && npm test
```

Expected: every suite passes, including the new `BillingSection.test.tsx`.

- [ ] **Step 3: Run the full shared package test suite**

```bash
cd shared && npm test
```

Expected: every suite passes, including the updated `billing-schemas.test.ts`.

- [ ] **Step 4: Typecheck every workspace**

```bash
cd server && npm run typecheck
cd ../client && npm run typecheck
cd ../shared && npm run typecheck
```

Expected: no errors anywhere.

- [ ] **Step 5: Final sweep for leftover Flutterwave references**

```bash
cd .. && grep -rln "flutterwave\|Flutterwave\|FLUTTERWAVE" client/src server/src shared/src server/.env.example 2>/dev/null
```

Expected: no output. (The historical migration file under `server/prisma/migrations/20260821153923_billing/` will still mention it, that's a record of the past, not live code, and migrations are never edited after the fact.)

- [ ] **Step 6: Set real credentials and verify against MTN's sandbox**

This step is a human task, not an automated one, no test in this plan calls MTN's real sandbox.

1. Reuse the same MTN sandbox account and credentials already provisioned for invoice-payments testing (or provision a second set the same way), this time putting them in `MOMO_BILLING_SUBSCRIPTION_KEY` / `MOMO_BILLING_API_USER` / `MOMO_BILLING_API_KEY` in `server/.env`, with `MOMO_BILLING_ENVIRONMENT="sandbox"`.
2. Restart the server so the new env vars load.
3. Log in as a user still on their free trial, go to Business Settings, find the Billing section, enter a phone number, and try both "Pay 6,500 RWF (Monthly)" and, in a separate attempt, "Pay 65,000 RWF (Annual)".
4. Confirm each resolves to "Payment received," and that `/billing/status` (the text shown at the top of the section) reflects the new plan and period end afterward.
5. Confirm `currentPeriodEnd` in the database extends correctly for a renewal made before the current period ends (stacks on top, doesn't reset), the same behavior `billing.checkout-poll.test.ts` already covers.

- [ ] **Step 7: Before production**

Confirm `MOMO_BASE_URLS.production` and the correct `MOMO_BILLING_TARGET_ENVIRONMENT` value against MTN's current Rwanda Collections API documentation, the exact same open caveat already flagged for the invoice-payments feature; both features share the same underlying `momo-client.ts` constants.

---

## Self-Review Notes

- **Spec coverage:** Context/decision (no custody question for Billa's own revenue, stated as a Global Constraint and reflected in Task 3's env-var-only credential design); Scope (Flutterwave removed entirely, checked off across Tasks 5 and 7); §1 Confirmation mechanism (Task 5's 3-second poll, 5-minute lazy expiry, identical to invoice payments); §2 Data model (Task 2, field for field); §3 Billa's own credentials (Task 3, matching the spec's function signature and env var names exactly); §4 Currency (Task 3's `getBillingMomoConfig`, verified EUR/RWF split); §5 Server routes (Task 5, matching every route path, response shape, and the per-plan idempotency rule); §6 Client UI (Task 6, matching the described phone-field-plus-two-buttons flow, and Task 7 removing the now-dead redirect page); §7 Testing (every task's own test file, plus Task 8's full-suite run; no test calls MTN's real sandbox); §8 Rollout (Task 8, Steps 6-7) are all covered.
- **Placeholder scan:** no "TBD"/"handle errors appropriately"/"similar to Task N" remain; every step has literal code, an exact command, or a fully-written-out manual verification checklist.
- **Type consistency:** `getBillingMomoConfig`'s `{ credentials: MomoCredentials; currency: string }` return shape (Task 3) is consumed identically in both routes in Task 5; the `{ status, failureReason }` poll response shape matches the one already proven in the invoice-payments feature and is what Task 6's client polling logic expects; `BillingCheckoutInput` (Task 4) matches exactly what Task 5's route destructures (`plan`, `phoneNumber`).
