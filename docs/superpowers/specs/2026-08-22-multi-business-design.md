# Multi-Business Support Design

**Goal:** Let one account own up to 3 businesses and switch between them, with a single subscription covering the whole account instead of one subscription per business.

## Scope

One owner, multiple businesses they personally run (e.g. a retail shop and a separate consulting business). No teammates, no invites, no per-business roles — that's a different feature and explicitly out of scope here. An account that owns exactly one business (the common case, and every account today) sees no behavior or UI change at all.

## Data model

Today `User.businessId` ties exactly one business to one user, and `Business` owns the trial/subscription fields (`trialEndsAt`, `currentPeriodEnd`, `plan`). This flips:

- `Business` gains `ownerId String` and an `owner User @relation(...)`. `User.businessId` is removed.
- `User` gains `trialEndsAt DateTime`, `currentPeriodEnd DateTime?`, `plan SubscriptionPlan?`, and `lastActiveBusinessId String?`. `Business` loses those three fields.
- `Payment` drops `businessId` (a payment funds the account, not one business) and keeps only `userId`.

Since teammates are out of scope, this is a plain one-to-many (`User.businesses: Business[]`), not a join table. A user can own 1 to 3 businesses; a business has exactly one owner.

## Session and switching

The access/refresh JWT cookies already carry `{userId, businessId}` and every route reads `req.auth!.businessId`. None of that changes — `requireAuth` and every downstream route stay exactly as they are today. What's new:

- `POST /auth/switch-business` (body: `{businessId}`): verifies `business.ownerId === req.auth.userId`, then re-mints both cookies with the new `businessId` claim, reusing the same token-minting helpers `/auth/session` already calls. Returns 403 `not_owner` if the business isn't owned by the caller.
- Ownership is checked at switch-time only, not on every request — consistent with how the session already trusts its claims for the token's lifetime without re-querying the database per request.
- On successful switch, the server also updates `User.lastActiveBusinessId` so the next login lands back in the same business.

## Sign-in and sign-up

`POST /auth/session` (existing endpoint) changes in one way: on an existing user's sign-in, instead of looking up their one business, it resolves `user.lastActiveBusinessId ?? (their first business by createdAt)` and mints the session with that businessId. Sign-up (first-time, with `businessName`) is unchanged in shape: creates one `User` (now carrying the 14-day trial fields) and one owned `Business`.

## Creating an additional business

New `POST /businesses` (new router, separate from the existing `business.ts` which manages the *current* business's profile):

- Body: `{name}` — same minimal requirement as sign-up.
- Checks `prisma.business.count({ where: { ownerId } })` is under 3; returns 409 `business_limit_reached` otherwise.
- Creates the business, sets it as `lastActiveBusinessId`, and switches the session into it immediately (same token remint as `/auth/switch-business`), so the user lands in the new business right away — mirroring sign-up's own "create then immediately enter" flow.

`GET /businesses` lists `{id, name}` for every business the caller owns, ordered by `createdAt` — used by the switcher UI.

## Billing

`requireActiveSubscription` and `GET /billing/status` switch from reading `business.trialEndsAt`/`currentPeriodEnd`/`plan` to reading the same fields on `req.auth.userId`'s `User` row. `POST /billing/checkout` and the `verifyAndRecordPayment` helper in `billing.ts` update `User` instead of `Business`, and the `txRef` prefix changes from `billa-${businessId}-...` to `billa-${userId}-...`. Behavior is otherwise identical: one active subscription unlocks writes across every business the account owns, because the gate no longer looks at any specific business at all.

## UI

- `AppLayout`'s header brand changes from static "Billa" to "Billa · {current business name}". For an account with exactly one business, that's the only visible change.
- When the account owns 2 or more businesses (from `GET /businesses`), the brand becomes a dropdown: each business name (selecting one calls `POST /auth/switch-business`, then reloads `/auth/me` and navigates to `/dashboard`), plus a trailing "+ Add another business" action. That action opens a small name-only form (mirroring how little sign-up asks for) that calls `POST /businesses`. The "+ Add another business" action is hidden once the account is at 3.
- Nothing else in the app changes — Settings, Billing, Documents, Customers, Items all continue to operate on whatever `businessId` the current session carries, exactly as today.

## Migration

This is pre-launch dev data (no real users yet), so the migration is a straightforward one-time backfill, not a zero-downtime concern:

1. Add the new columns (`Business.ownerId` nullable, `User.trialEndsAt` nullable, `currentPeriodEnd`, `plan`, `lastActiveBusinessId`).
2. Backfill: for each existing `Business`, set `ownerId` to the `id` of the `User` whose (soon-to-be-removed) `businessId` points to it. For each `User`, copy `trialEndsAt`/`currentPeriodEnd`/`plan` from that same business, and set `lastActiveBusinessId` to that business's id.
3. Make `Business.ownerId` and `User.trialEndsAt` required, drop `User.businessId` and `Business.trialEndsAt`/`currentPeriodEnd`/`plan`, drop `Payment.businessId`.

## Testing

Server: new tests for `POST /auth/switch-business` (switches successfully when owned, 403 when not owned, updates `lastActiveBusinessId`), `POST /businesses` (creates, enforces the 3-business cap, switches into the new business), `GET /businesses` (scoped to the caller, ordered by creation), and updated billing tests asserting the gate and status now key off the user, not the business. Existing single-business tests continue to pass unchanged since their behavior doesn't move.

Client: a new switcher component test (hidden with one business, shows all business names and "+ Add another business" with two or more, hides that action at three), and an "add business" form test following the same pattern as `Register.tsx`'s minimal-field form.
