# MTN MoMo Invoice Payments, Design

## Context

Payment collection has been on hold since the earlier Flutterwave attempt didn't work cleanly for Rwanda (see the payments-descoped project memory). The user asked to bring MTN Mobile Money in as a payment option. MTN MoMo is the dominant mobile money network in Rwanda and is the right first provider to support.

Billa has two separate places "payment" could mean:

1. **Customers paying a business's invoice.** Today this is a manual ledger only (`InvoicePayment`, from the payment-tracking design): the business owner records that they received cash, a bank transfer, or a MoMo transfer, after the fact. There is no live payment collection.
2. **Businesses paying their own Billa subscription,** the `/billing/checkout` flow, currently non-functional because it was built against Flutterwave.

This spec covers **only the first one**: customers paying an invoice through Billa via MTN MoMo. Reviving Billa's own subscription billing with MoMo is a deliberate, separate follow-up spec once this one has shipped and proven the integration pattern works.

### The decision that shapes everything else

Billa does **not** hold or move customer money. Each business brings its own MTN MoMo Collections API subscription (obtained directly from MTN, outside Billa) and pastes those credentials into Billa's settings. When a customer pays, the money goes straight from the customer's MoMo wallet to the business's own MoMo account; Billa's server only ever triggers the API call and reports the result.

The alternative, a single Billa-owned MoMo account collecting on behalf of every business, would mean Billa is custodying and later disbursing other people's money. In Rwanda that is very likely regulated as payment service provision by BNR (the central bank) and would require a license Billa does not have, plus a disbursement and reconciliation system this spec does not build. That path is explicitly rejected here, not deferred.

## Scope

**In scope:**

- A business enables MTN MoMo and enters its own Collections API credentials (sandbox or production) in Business Settings.
- A customer viewing a finalized, unpaid invoice on its public link can pay the full outstanding balance via MTN MoMo.
- Billa polls MTN for the result and, on success, records it through the existing `InvoicePayment` ledger, so receivables, receipts, and payment-status calculations need no changes.
- Credentials are encrypted at rest.

**Out of scope, deliberately:**

- Billa's own subscription billing via MoMo (separate future spec).
- Partial or custom-amount MoMo payments. A customer pays the invoice's exact remaining balance or doesn't pay via MoMo at all; a partial payment still has to be recorded manually, same as today.
- Document types other than `INVOICE`. Quotes and proformas have accept/decline, not payment.
- Webhook-based confirmation. Polling only for this pass (see "Confirmation mechanism" below).
- Refunds or disbursements.
- Billa provisioning or managing a business's MTN merchant relationship. The business's relationship with MTN is theirs; Billa only consumes the credentials they provide.

## 1. Confirmation mechanism: polling, not webhooks

MTN's docs push toward a callback URL MTN calls when a `RequestToPay` resolves. That needs a publicly reachable HTTPS endpoint, which the current dev setup doesn't have, and verifying an inbound callback is genuinely from MTN (signature or IP allowlist handling) is a bigger lift than this first pass needs.

Instead: after creating a payment request, the customer's browser polls Billa's own status endpoint every few seconds. Each poll, if the request is still `PENDING`, Billa's server checks MTN's status endpoint once and updates its own record. This needs no background scheduler and no public callback URL; it piggybacks on the browser tab already being open and waiting.

A `RequestToPay` that MTN itself hasn't resolved within 5 minutes is treated as expired by Billa (checked lazily on the next poll, not via a scheduled sweep) and the customer is told to try again.

## 2. Data model

### `Business`, new fields

```prisma
model Business {
  // ...existing fields...

  momoEnabled             Boolean  @default(false)
  momoEnvironment         String?  // "sandbox" | "production"
  momoTargetEnvironment   String?  // MTN's X-Target-Environment value, e.g. "sandbox" or a production value MTN assigns
  momoSubscriptionKeyEnc  String?  // encrypted
  momoApiUserEnc          String?  // encrypted
  momoApiKeyEnc           String?  // encrypted

  momoPaymentRequests MomoPaymentRequest[]
}
```

All three credential fields are encrypted with the same module (see "Encryption" below) even though the API User alone isn't inherently secret. One rule ("everything in this trio is encrypted") is easier to get right than reasoning per-field about what needs it.

### `MomoPaymentRequest`, new model

Tracks an in-flight or resolved payment attempt. Deliberately separate from `InvoicePayment`, which continues to mean "confirmed money received" exactly as it does today.

```prisma
enum MomoRequestStatus {
  PENDING
  SUCCESSFUL
  FAILED
  EXPIRED
}

model MomoPaymentRequest {
  id            String            @id @default(cuid())
  businessId    String
  documentId    String
  referenceId   String            @unique // the X-Reference-Id sent to MTN
  phoneNumber   String
  amount        Int
  status        MomoRequestStatus @default(PENDING)
  failureReason String?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  business Business @relation(fields: [businessId], references: [id])
  document Document @relation(fields: [documentId], references: [id])

  invoicePayment InvoicePayment? @relation("MomoRequestPayment")

  @@index([businessId])
  @@index([documentId])
  @@index([status])
}
```

### `InvoicePayment`, one new field

```prisma
model InvoicePayment {
  // ...existing fields...
  momoPaymentRequestId String? @unique
  momoPaymentRequest    MomoPaymentRequest? @relation("MomoRequestPayment", fields: [momoPaymentRequestId], references: [id])
}
```

`createdByUserId` (existing, required) is set to the business's `ownerId` for a MoMo-originated payment. The presence of `momoPaymentRequestId` is what distinguishes "the business's MoMo integration confirmed this" from "a team member typed this in manually" in the UI and audit trail. `method` is set to the existing `MOBILE_MONEY` value; no new `PaymentMethod` enum value is needed.

## 3. Encryption

Nothing in this codebase encrypts anything at rest today (the TOTP secret, checked while writing this spec, is stored plain). A new `server/src/lib/encryption.ts` module:

```ts
export function encrypt(plaintext: string): string;
export function decrypt(ciphertext: string): string;
```

AES-256-GCM, a random IV per call, key read once from a required server-only env var (`MOMO_CREDENTIALS_ENCRYPTION_KEY`, 32 raw bytes, base64-encoded in the env file). The IV and auth tag travel alongside the ciphertext in the stored string (`iv:authTag:ciphertext`, each hex-encoded) so `decrypt` is self-contained given just that one string and the key. `decrypt` throws on a tampered or truncated value rather than returning garbage.

Decryption only ever happens server-side, immediately before a call to MTN. A business's saved MoMo settings are never round-tripped back to the client in decrypted form; the settings page shows "configured" plus the environment, not the credential values.

## 4. MTN MoMo API client

`server/src/lib/momo-client.ts`, one function per MTN operation, each taking a business's decrypted credentials explicitly (no hidden global state, since every call is scoped to one business):

```ts
interface MomoCredentials {
  subscriptionKey: string;
  apiUser: string;
  apiKey: string;
  targetEnvironment: string;
  baseUrl: string; // sandbox vs. production host
}

function getAccessToken(creds: MomoCredentials): Promise<string>;
function requestToPay(creds: MomoCredentials, token: string, input: {
  referenceId: string;
  amount: number;
  phoneNumber: string;
  externalId: string; // Billa's own MomoPaymentRequest id
  payerMessage: string;
  payeeNote: string;
}): Promise<void>; // MTN returns 202 with no body; failure throws
function getRequestToPayStatus(creds: MomoCredentials, token: string, referenceId: string): Promise<{
  status: "PENDING" | "SUCCESSFUL" | "FAILED";
  reason?: string;
}>;
```

A fresh access token is fetched on every operation rather than cached. MTN's tokens are valid roughly an hour and Billa's MoMo call volume doesn't justify the complexity of a per-business token cache with expiry tracking in this first pass; it's a clean later optimization if MTN's rate limits ever become a real constraint.

This module is the single thing route handlers depend on and the single thing tests mock. No other file makes an HTTP call to MTN directly.

**One detail to confirm against MTN's current developer docs at implementation time, not assumed here:** in sandbox, `X-Target-Environment` is always the literal string `sandbox`. In production, MTN assigns the correct value as part of a merchant's own onboarding, and this has changed over the life of MTN's API before. Rather than hard-code a guess, `momoTargetEnvironment` is a field the business fills in for production (sandbox mode fills it automatically), with the exact value to enter documented on the settings page by whatever MTN's own current Rwanda integration guide says.

## 5. Server routes

### Business settings (owner-only, mirrors the existing `businessRouter` middleware chain)

- `GET /business/momo-settings` → `{ enabled, environment, targetEnvironment, configured: boolean }`. Never returns credential values.
- `PATCH /business/momo-settings` → body `{ enabled, environment, targetEnvironment, subscriptionKey, apiUser, apiKey }`. Encrypts and saves. Only the owner can call this (same `requireOwner` pattern already used for `/business/members`).
- `POST /business/momo-settings/test` → attempts `getAccessToken` against whatever is currently saved (or against values passed in the request body, so a business can test before saving). Returns `{ ok: true }` or `{ ok: false, error }`. This is what backs the settings page's "Test connection" button.

### Public, customer-facing (no auth, same trust boundary as the existing `/public/documents/:token` routes)

- `POST /public/documents/:token/momo/request` → body `{ phoneNumber }`.
  - 404 if the token doesn't resolve to a finalized invoice with an outstanding balance.
  - 400 if the business doesn't have MoMo enabled.
  - If a non-expired `PENDING` request already exists for this document, returns that one instead of creating a second (idempotency against double-clicks).
  - Otherwise creates a `MomoPaymentRequest` for the invoice's current outstanding balance (status `PENDING`), calls `requestToPay` with that amount, and returns `{ requestId }`. If the MTN call itself fails (bad credentials, network error), the request row is marked `FAILED` immediately and the error is returned.
- `GET /public/documents/:token/momo/request/:requestId`
  - If the stored status is already terminal (`SUCCESSFUL`/`FAILED`/`EXPIRED`), returns it directly without calling MTN again.
  - If `PENDING` and older than 5 minutes, marks it `EXPIRED` and returns that.
  - If `PENDING` and still fresh, calls `getRequestToPayStatus` once:
    - `SUCCESSFUL` → re-checks the invoice's current outstanding balance (defends against a race with a manually-recorded payment landing in between), creates the `InvoicePayment` row via the same internal function the manual-recording route already uses, updates the document's payment status, marks the request `SUCCESSFUL`.
    - `FAILED` → stores MTN's reason, marks the request `FAILED`.
    - still `PENDING` → returns `PENDING`, no state change.

## 6. Client UI

### Business Settings: new "MTN Mobile Money" section

Same pattern as `TwoFactorSection.tsx` and `BillingSection.tsx`: its own component, its own load/save state. Fields: enable toggle, environment select (Sandbox / Production), Subscription Key / API User / API Key inputs (password-masked, using the existing `FormField` show/hide pattern), a "Test connection" button, and a "Save" button. Selecting Sandbox sends `momoTargetEnvironment: "sandbox"` automatically with no field shown. Selecting Production reveals a "Target environment" text field, with a line explaining it's the value MTN assigned during the business's own merchant onboarding. Once saved, the credential inputs are cleared and the section shows "Configured (sandbox)" or "Configured (production)" with a "Change credentials" action rather than ever re-displaying a saved secret.

### Public document view: "Pay with MTN MoMo"

On `PublicDocumentView.tsx`, for a finalized `INVOICE` with an outstanding balance whose business has `momoEnabled`, a new section below the existing content: a phone number field (pre-filled from the customer's own phone if Billa already has it) and a "Pay {amount} RWF with MTN MoMo" button.

Submitting it calls the request endpoint, then polls the status endpoint every 3 seconds. While `PENDING`, the UI shows "Check your phone to approve this payment" with a spinner. On `SUCCESSFUL`, it shows a confirmation and refreshes the document so the page reflects the new payment status. On `FAILED` or `EXPIRED`, it shows what happened and offers to try again.

## 7. Testing

- `encryption.test.ts`: encrypt/decrypt round-trips correctly; decrypting a tampered string throws; decrypting with the wrong key throws.
- `momo-client.test.ts`: each function against a mocked `fetch`, covering the success shape and MTN's documented error responses (expired token, invalid credentials, insufficient funds, invalid phone number).
- Route tests for both business-settings and public routes, with `momo-client` mocked, covering: happy path end to end (request → still-pending poll → successful poll → `InvoicePayment` created), duplicate-request idempotency, expiry, and the race check against a balance already paid down manually.
- Client tests for the new settings section (save, test-connection success/failure) and the public payment button (submit, pending-poll UI, success, failure).

No test ever calls MTN's real sandbox; the sandbox is for a human to verify the integration once, by hand, before this ships.

## 8. Rollout

Built and verified against MTN's own sandbox (a free developer account at momodeveloper.mtn.com, with MTN-documented test phone numbers that deterministically succeed or fail) before any real business enters production credentials. The "sandbox vs. production" toggle in Business Settings exists specifically so a business can validate their own setup against MTN's test environment before flipping it live with their real MoMo account.
