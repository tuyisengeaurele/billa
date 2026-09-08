# MTN MoMo Subscription Billing, Design

## Context

Billa's own subscription billing (`/billing/checkout`) has been non-functional since Flutterwave was found not to work cleanly for Rwanda (see the payments-descoped project note). The MTN MoMo invoice-payments work already proved out the whole pattern needed here: a Collections API subscription, `RequestToPay` plus polling, and a working `momo-client.ts` wrapper. This spec reuses that pattern for the second payment surface Billa has: businesses paying Billa itself, rather than customers paying a business.

The custody question that shaped the invoice-payments design does not apply here. Billa collecting its own subscription revenue into its own MoMo account is Billa acting as merchant of record for its own product, the same as any shop collecting payment for what it sells. There is no intermediation of someone else's money and no BNR payment-service-provider licensing question to work around.

## Scope

**In scope:**

- A user pays for their Billa subscription (Monthly or Annual) via MTN MoMo: enters a phone number, confirms on their phone, sees the result, the same interaction shape already built and tested for invoice payments.
- Billa uses one single, platform-wide MTN MoMo Collections subscription. Not per business; there is only one Billa.
- A successful payment extends `currentPeriodEnd` by the plan's period and sets `plan`, exactly as today's Flutterwave path does.
- Flutterwave is removed entirely: `server/src/lib/flutterwave.ts`, the `/billing/verify` and `/billing/webhook` routes, the `BillingCallback` page and its route, and the `FLUTTERWAVE_*` env vars.

**Out of scope:**

- Refunds, cancellations, proration, or plan changes mid-period.
- Any payment method other than MTN MoMo for subscription billing.
- Anything about a business's own MoMo credentials (the invoice-payments feature). Those are untouched by this spec.
- A renewal notification. `/billing/status` already reflects the new period live; adding a notification type for this is a separate, small piece of scope creep this spec skips.

## 1. Confirmation mechanism: polling, same reasoning as invoice payments

No public webhook endpoint exists, and MTN's callback verification is more than this needs. After creating a payment, the browser polls Billa's own status endpoint every few seconds. Each poll checks MTN's status endpoint at most once. A `PENDING` payment older than 5 minutes is treated as `EXPIRED`, checked lazily on the next poll rather than via a scheduled sweep.

## 2. Data model

`Payment` picks up a `phoneNumber` field and an `EXPIRED` status, and drops the Flutterwave-specific `flutterwaveTxId` (the existing `txRef` already doubles as MTN's `X-Reference-Id`, no separate field is needed for that). A `failureReason` is added so a failed payment can show the customer something more useful than "it didn't work," matching the pattern `MomoPaymentRequest` already uses for invoice payments.

```prisma
enum PaymentStatus {
  PENDING
  SUCCESSFUL
  FAILED
  EXPIRED
}

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

## 3. Billa's own MoMo credentials

Unlike the per-business credentials in the invoice-payments feature, there is exactly one set of these, so they live in env vars and are read directly at request time, the same way `GMAIL_APP_PASSWORD` and `FIREBASE_PRIVATE_KEY` already work in this codebase. No encryption module is needed here; that module exists specifically to protect other businesses' credentials sitting in the database, and nothing here sits in the database.

New env vars: `MOMO_BILLING_SUBSCRIPTION_KEY`, `MOMO_BILLING_API_USER`, `MOMO_BILLING_API_KEY`, `MOMO_BILLING_ENVIRONMENT` (`"sandbox"` or `"production"`), and `MOMO_BILLING_TARGET_ENVIRONMENT` (only meaningful, and only required, in production; sandbox always uses the literal string `"sandbox"`, the same rule the invoice-payments feature already follows).

```ts
function getBillingMomoCredentials(): MomoCredentials {
  const environment = requireEnv("MOMO_BILLING_ENVIRONMENT") as "sandbox" | "production";
  return {
    subscriptionKey: requireEnv("MOMO_BILLING_SUBSCRIPTION_KEY"),
    apiUser: requireEnv("MOMO_BILLING_API_USER"),
    apiKey: requireEnv("MOMO_BILLING_API_KEY"),
    targetEnvironment: environment === "sandbox" ? "sandbox" : requireEnv("MOMO_BILLING_TARGET_ENVIRONMENT"),
    baseUrl: MOMO_BASE_URLS[environment],
  };
}
```

`requireEnv` is a small new helper (`server/src/lib/require-env.ts`): read a `process.env` var, throw a clear error naming the missing var if it's unset. This is the same lazy-read-and-throw shape every other single-account integration in this codebase already uses; it just replaces five copy-pasted `if (!x) throw` checks with one reusable function.

## 4. Currency

Confirmed directly by hand against MTN's real sandbox while building invoice payments: the sandbox only accepts `EUR` regardless of target market, production uses the real local currency. This spec builds that in from the start rather than rediscovering it:

```ts
const currency = environment === "sandbox" ? "EUR" : "RWF";
```

decided from `MOMO_BILLING_ENVIRONMENT`, the same rule the invoice-payments route now uses.

## 5. Server routes

All under the existing `billingRouter`, all `requireAuth`.

- `POST /billing/checkout`, body `{ plan, phoneNumber }`.
  - If a non-expired `PENDING` `Payment` already exists for this user and this plan, return that one instead of creating a second (idempotency against double-clicks, scoped per plan the same way invoice payments scope per document, since a user might legitimately want to switch from a pending Monthly attempt to Annual).
  - Otherwise create a `Payment` row (status `PENDING`, the plan's price, `RWF` as the recorded currency regardless of what was actually sent to MTN, since that's what the business's own ledger should show) and call `requestToPay`.
  - On an MTN-call failure, mark the payment `FAILED` with the error message and return 502.
  - On success, return `{ paymentId: payment.id }`.
- `GET /billing/checkout/:paymentId` (must belong to `req.auth.userId`).
  - 404 if missing or not owned by this user.
  - Terminal status (`SUCCESSFUL`/`FAILED`/`EXPIRED`) returns directly, no MTN call.
  - `PENDING` and older than 5 minutes: mark `EXPIRED`, return that.
  - `PENDING` and fresh: check MTN once.
    - `SUCCESSFUL`: extend `currentPeriodEnd` (the later of "now" or the existing `currentPeriodEnd", plus the plan's days) and set `plan`, using the exact same math `verifyAndRecordPayment` already has today. Mark the `Payment` `SUCCESSFUL`.
    - `FAILED`: store MTN's reason, mark `FAILED`.
    - still `PENDING`: return `PENDING`, no state change.
- `GET /billing/status`: unchanged.
- Removed: `POST /billing/verify`, `POST /billing/webhook`.

## 6. Client UI

`BillingSection.tsx` keeps its current status display (the "Free trial, active until..." / "Monthly (6,500 RWF), active until..." text) and replaces the two "Subscribe" buttons that redirect with the same inline flow `PublicDocumentView` already has for invoice payments: a phone number field (pre-filled from `user.phone` when Billa already has it), then a "Pay 6,500 RWF (Monthly)" and a "Pay 65,000 RWF (Annual)" button. Submitting one calls the checkout route, then polls every 3 seconds. `PENDING` shows a spinner and "Check your phone to approve this payment." `SUCCESSFUL` shows a confirmation and refreshes the billing status shown at the top of the section. `FAILED` or `EXPIRED` shows what happened and offers to try again.

`client/src/pages/BillingCallback.tsx` and its route in `App.tsx` are deleted, there is no redirect to land from anymore.

## 7. Testing

- `require-env.test.ts`: throws with a clear message naming the missing var; returns the value when set.
- Route tests for `POST /billing/checkout` and `GET /billing/checkout/:paymentId`, `momo-client` mocked, covering: happy path end to end (checkout, still-pending poll, successful poll, `currentPeriodEnd` extended correctly for both a fresh subscriber and one renewing before their current period ends), idempotency against a second checkout call for the same plan, expiry, sandbox currency selection (`EUR`), and that a payment for one user can't be polled by another.
- Client tests for the redesigned `BillingSection`: phone field pre-fill, submit, pending-poll UI, success (status text updates), failure and retry.
- No test ever calls MTN's real sandbox; sandbox is for verifying the integration once by hand, exactly as done for invoice payments, before this ever reaches production.

## 8. Rollout

Verify end to end in MTN's sandbox (the existing sandbox account and credentials used for invoice-payments testing are reusable here too) before ever setting `MOMO_BILLING_ENVIRONMENT=production`. This is the only paid-signup path in the app, a broken checkout blocks every new subscriber, so both plans (Monthly and Annual) should be run through by hand at least once in sandbox before this ships.
