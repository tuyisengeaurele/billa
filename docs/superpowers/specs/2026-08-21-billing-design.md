# Billa: Billing & Subscriptions (Stage 14)

Date: 2026-08-21

## Scope

A monthly (6,500 RWF) and annual (65,000 RWF) subscription, paid through Flutterwave (cards and Mobile Money), with a 14-day free trial and a read-only lapse state instead of a hard lockout. Payment is tied to the business, with the paying user recorded for the audit trail.

## Why checkout-per-period instead of auto-renewal

Flutterwave's recurring "Payment Plans" API can silently re-charge a tokenized card, but Mobile Money charges can't be silently re-run the same way: the customer has to approve each one (typically via a USSD prompt or their Mobile Money app). Building around auto-renewal would mean Mobile Money subscribers hit confusing silent failures at renewal time. Instead, every payment, first or renewal, goes through the same Flutterwave-hosted checkout page. Billa tracks the resulting paid-through date itself. This costs a manual click each renewal period but behaves identically for card and Mobile Money payers, which matters more for this market than seamless auto-renewal would.

## Schema

`Business` gains:

```prisma
model Business {
  // ...existing fields...
  trialEndsAt      DateTime
  currentPeriodEnd DateTime?
  plan             SubscriptionPlan?

  payments Payment[]
}

enum SubscriptionPlan {
  MONTHLY
  ANNUAL
}
```

`trialEndsAt` is set once, at business creation (`createdAt + 14 days`), inside the sign-up branch of `POST /auth/session`. There's no stored "active/trialing/expired" status field: whether a business currently has access is always derived by comparing `currentPeriodEnd ?? trialEndsAt` to now, everywhere it's checked. Storing a separate status field that has to be kept in sync with these dates is exactly the kind of drift-prone derived state worth avoiding.

New `Payment` model, both an audit trail and the mechanism that makes verification idempotent:

```prisma
model Payment {
  id              String        @id @default(cuid())
  businessId      String
  userId          String
  plan            SubscriptionPlan
  amount          Int
  currency        String
  txRef           String        @unique
  flutterwaveTxId String?
  status          PaymentStatus @default(PENDING)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  business Business @relation(fields: [businessId], references: [id])
  user     User     @relation(fields: [userId], references: [id])

  @@index([businessId])
}

enum PaymentStatus {
  PENDING
  SUCCESSFUL
  FAILED
}
```

A `Payment` row is created as `PENDING` the moment checkout is initiated (before the customer is redirected to Flutterwave), keyed by a `txRef` we generate ourselves (`billa-<businessId>-<random>`). Verification later looks the row up by `txRef`, not by trusting anything Flutterwave hands back unchecked.

## Server

**`POST /billing/checkout`** (authenticated): body `{ plan: "MONTHLY" | "ANNUAL" }`. Creates a `PENDING` `Payment` row with a fresh `txRef`, calls Flutterwave's `POST /v3/payments` with the plan's amount, `currency: "RWF"`, the generated `txRef`, a `redirect_url` pointing at the client's `/billing/callback`, and the authenticated user's email. Returns `{ link }`, the hosted Flutterwave checkout URL the client redirects the browser to.

**`POST /billing/verify`** (authenticated): body `{ txRef }`. Looks up the `Payment` by `txRef` (404 if it doesn't belong to the caller's business), calls Flutterwave's `GET /v3/transactions/:id/verify` (the `Payment` doesn't have Flutterwave's transaction id yet at this point, so this step first needs it; see note below), confirms the returned amount, currency, and status genuinely match what was expected, and if so:

- Marks the `Payment` `SUCCESSFUL` (if it's already `SUCCESSFUL`, this is a no-op, making the endpoint safe to call twice).
- Extends `currentPeriodEnd`: `base = currentPeriodEnd && currentPeriodEnd > now ? currentPeriodEnd : now`, then `+30 days` for `MONTHLY` or `+365 days` for `ANNUAL`, so paying early doesn't waste remaining time.
- Sets `plan` to whichever was purchased.

Note on getting Flutterwave's transaction id: the `/billing/callback` redirect carries `transaction_id` as a query param from Flutterwave, so the client passes both `txRef` and `transactionId` to `/billing/verify`; the server calls the verify API with `transactionId` and cross-checks the response's own `tx_ref` matches the `Payment` row before trusting anything else in the response.

**`POST /billing/webhook`** (not session-authenticated; authenticated via Flutterwave's `verif-hash` header matched against `FLUTTERWAVE_WEBHOOK_HASH`): same verify-and-record logic as above, run against `data.id` and `data.tx_ref` from the webhook payload. This exists purely as a backstop for the case where a customer closes the tab before the redirect completes; the redirect-triggered call above is the primary path and will fire on every successful local test.

**`GET /billing/status`** (authenticated): returns the caller's business's `trialEndsAt`, `currentPeriodEnd`, `plan`, and a computed `activeUntil`, for the Billing settings UI.

**Gating middleware**, applied to the documents, customers, and items routers only (not the business router, since a lapsed business still needs to reach its own Billing settings and reference/update basic profile info):

```ts
export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET") {
    next();
    return;
  }
  const business = await prisma.business.findUnique({ where: { id: req.auth!.businessId } });
  if (!business) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const activeUntil = business.currentPeriodEnd ?? business.trialEndsAt;
  if (activeUntil > new Date()) {
    next();
    return;
  }
  res.status(402).json({ error: "subscription_required" });
}
```

Reads (`GET`) always pass through; every other method on those three routers is blocked with 402 once the business is past both its trial and any paid period. PDF downloads (`GET /documents/:id/pdf`) are unaffected, matching the "read-only, not locked out" decision.

## Client

**Billing section in Business Settings**, alongside the existing profile form and document-numbering section: shows the current status (trial countdown, or plan and renewal date), and a "Subscribe" button per plan that calls `/billing/checkout` and redirects the browser to the returned link.

**New `/billing/callback` page**: reads `tx_ref`, `transaction_id`, and `status` from the URL, calls `/billing/verify`, and shows a success or failure message with a link back to Settings.

**Site-wide awareness**: `AppLayout` fetches `/billing/status` once and shows a persistent banner when the business is within 3 days of its trial or paid period ending ("Your trial ends in 2 days") or already past it ("Your trial has ended. Subscribe to keep creating documents."), so the constraint is visible before someone hits a blocked action, not only after.

**Mutation error handling**: the existing `err instanceof ApiError ? "<specific message>" : "Something went wrong"` pattern already used on every create/edit form (documents, customers, items) gets one more branch: `err instanceof ApiError && err.status === 402` shows "Your trial has ended. Subscribe in Settings to continue." instead of the generic fallback.

## Environment

Server needs `FLUTTERWAVE_SECRET_KEY` and `FLUTTERWAVE_WEBHOOK_HASH`. Flutterwave issues free test-mode keys (prefixed `FLWSECK_TEST-`) on signup, with test card and Mobile Money numbers that simulate a real payment without moving money, so the whole flow can be built and verified without a live business account. The webhook backstop specifically needs a publicly reachable URL, which localhost isn't; the redirect-triggered verification path (the primary one) works locally without any tunnel, so this doesn't block most of the work, only the webhook backstop's own live test.

## Testing

- Server: `POST /billing/checkout` creates a `PENDING` `Payment` and returns a link (Flutterwave's own API call mocked in tests). `POST /billing/verify` extends `currentPeriodEnd` correctly for both plans, stacks an early renewal on top of remaining time rather than resetting it, is idempotent on a second call with the same `txRef`, and rejects a `txRef` that doesn't belong to the caller's business. `POST /billing/webhook` rejects a bad `verif-hash` and is idempotent the same way. `requireActiveSubscription` allows GET always, allows POST/PATCH/DELETE during an active trial or paid period, and blocks them with 402 once both have lapsed.
- Client: the Billing section renders trial/subscription status correctly and redirects on "Subscribe". The callback page shows success or failure based on `/billing/verify`'s response. The `AppLayout` banner appears when expected and not otherwise. A 402 during document/customer/item creation shows the subscription-specific message.

## Not covered here

Invoices/receipts for Billa's own subscription charges (Flutterwave's own receipt emails cover this for now), refunds, plan changes mid-period, multiple payment methods on file, and any admin-side view across all businesses' subscriptions.
