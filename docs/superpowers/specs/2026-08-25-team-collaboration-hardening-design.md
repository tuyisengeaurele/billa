# Team Collaboration Hardening — Design

## Context

Billa shipped multi-user business accounts (owner + invited members) earlier this session. This spec covers three follow-up pieces identified while brainstorming what "world class" looks like for the owner/member relationship:

1. A real correctness bug: removing a member doesn't immediately revoke their access.
2. An activity log, serving both the owner's need for team accountability and each member's "what have I done" view (the answer to "do members have their own dashboard?" — they don't get a separate dashboard, but they get a personal activity feed).
3. Invite link recovery — once an invite is sent, the owner currently has no way to see the link again if the email didn't land.

Deferred to a later pass (out of scope here): granular roles beyond owner/member, and ownership transfer.

## 1. Session revocation on member removal

### Problem

`req.auth.businessId` is baked into a signed JWT at issuance time (`issueSession`) and trusted by every route without re-checking membership. Two issuance paths don't re-validate access either:

- `POST /auth/session` (existing-user branch): blindly trusts `user.lastActiveBusinessId` and issues a session for it, never checking the user still has access.
- `POST /auth/refresh`: blindly reissues a token scoped to `stored.businessId` from the refresh token row, never checking current access.

So today, a removed member who logs out and back in — or who simply lets their token refresh — keeps getting back into a business they no longer belong to, indefinitely.

### Fix

Three coordinated changes:

**a. `DELETE /business/members/:userId` (server/src/routes/business.ts)** — after deleting the `BusinessMember` row, in the same handler:
- Revoke all `RefreshToken` rows where `userId` matches and `businessId` matches the removed business (`updateMany` setting `revokedAt`).
- If the removed user's `lastActiveBusinessId` equals the business they were removed from, clear it (set to `null`) so `/auth/session`'s fallback logic (see below) kicks in on their next login instead of pointing at a business they no longer have access to.

**b. `POST /auth/session` existing-user branch (server/src/routes/auth.ts)** — before trusting `existing.lastActiveBusinessId`, validate it with `hasBusinessAccess(existing.id, businessId)` (already built this session, in `server/src/lib/business-access.ts`). If it fails (or `lastActiveBusinessId` is null), fall back to the existing "first owned business" query. A user always owns at least one business (created at registration), so this fallback can't hit a zero-business edge case.

**c. No change needed to `/auth/refresh`** — since refresh tokens for the removed business are revoked in (a), a removed member's next refresh attempt hits the existing `!stored` / `stored.revokedAt` 401 path already in that route. No new check needed there.

### Accepted tradeoff

An already-issued access token (15-minute TTL, `JWT_ACCESS_TTL`) keeps working until it expires or the tab is closed and reopened — no per-request DB membership check is added, since that would cost a query on every single authenticated request forever to protect against a rare, low-severity edge case (a removed member using an already-open tab for at most 15 more minutes). This is normal, expected behavior for JWT-based auth systems.

### Testing

- `DELETE /business/members/:userId` revokes that member's refresh tokens scoped to the business, and clears `lastActiveBusinessId` if it pointed there (leaves other businesses' refresh tokens and `lastActiveBusinessId` alone if it pointed elsewhere).
- A removed member's stale refresh token is rejected by `/auth/refresh` (401).
- A removed member logging in fresh (`/auth/session`) with a stale `lastActiveBusinessId` falls back to their own owned business instead of the business they were removed from.
- A member who still owns their own business, once removed from someone else's, can still log into their own business normally (fallback doesn't break the unaffected case).

## 2. Activity log

### Schema

New model in `server/prisma/schema.prisma`:

```prisma
enum ActivityAction {
  DOCUMENT_CREATED
  DOCUMENT_FINALIZED
  DOCUMENT_DELETED
  CUSTOMER_CREATED
  CUSTOMER_DELETED
  MEMBER_INVITED
  MEMBER_JOINED
  MEMBER_REMOVED
}

model ActivityLogEntry {
  id           String         @id @default(cuid())
  businessId   String
  actorUserId  String
  action       ActivityAction
  entityType   String
  entityId     String
  metadata     Json?
  createdAt    DateTime       @default(now())

  business Business @relation(fields: [businessId], references: [id])
  actor    User     @relation(fields: [actorUserId], references: [id])

  @@index([businessId, createdAt])
  @@index([actorUserId])
}
```

`entityType`/`entityId` point at the affected record (e.g. `"Document"` / the document's id) so a future "jump to this document" link is possible without a schema change. `metadata` carries small denormalized display data (e.g. `{ "documentNumber": "INV-0004", "documentType": "INVOICE" }`, `{ "customerName": "Acme Ltd" }`, `{ "email": "friend@example.com" }`) so the feed can render a human sentence without extra joins/lookups against rows that might since have been deleted.

### Where logging happens

A single small helper, `server/src/lib/activity-log.ts`:

```ts
export async function logActivity(input: {
  businessId: string;
  actorUserId: string;
  action: ActivityAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}): Promise<void>
```

Called inline (not queued/async-deferred — this is SME-scale traffic, no need for that complexity) from the existing route handlers, right after the underlying mutation succeeds:

- `documents.ts`: on create, on finalize, on delete.
- `customers.ts`: on create, on delete.
- `business.ts` invite routes: on invite create (`MEMBER_INVITED`), on member removal (`MEMBER_REMOVED`).
- `invites.ts`: on accept (`MEMBER_JOINED`).

Deliberately not logged: item-catalog changes, business-settings edits, document numbering changes, brand color/template changes. Lower signal, and instrumenting every PATCH would touch far more of the codebase than this feature is worth right now. Can extend later.

### API

`GET /business/activity` (new route in `business.ts`, `requireAuth` only — no `requireOwner`, per the team-wide-visibility decision):
- Query params: `page`, `pageSize` (reuse the existing pagination convention from `contact-schemas.ts`/`validate-query.ts`), optional `actorUserId` for the "my activity" filter.
- Returns entries newest-first, each with the actor's email joined in (`{ id, action, entityType, entityId, metadata, createdAt, actor: { id, email } }`).

### Client

New page `client/src/pages/Activity.tsx`, route `/activity`, linked from the sidebar nav (`AppLayout.tsx`) and from a "See all activity" link on the Team section. Renders:
- A toggle/tab: "Team activity" (default) vs "My activity" (client-side just adds `actorUserId=<current user id>` to the query).
- A simple list, each row a human-readable sentence built from `action` + `metadata` (e.g. "Amina created invoice INV-0004" — a small `ACTIVITY_LABELS` lookup keyed by `action`, similar in spirit to `DOCUMENT_TYPE_LABELS`), with a relative timestamp.
- Paginated (reuse the existing `usePaginatedList` hook already used elsewhere in the client, per `usePaginatedList.test.ts` seen this session).

### Testing

- `logActivity` unit test: writes the row with the given fields.
- Each instrumented route (documents create/finalize/delete, customers create/delete, invite create/accept, member remove) gets a test asserting an `ActivityLogEntry` row was written with the right `action`/`entityType`/`entityId`.
- `GET /business/activity`: returns team-wide entries by default; `actorUserId` filter narrows to one user; a member (not just the owner) can read it (asserts no `requireOwner` gate); pagination works; a stranger with no business access gets 401/403 same as other business-scoped routes.
- Client: `Activity.tsx` renders the list, the tab toggle switches the query filter, empty state when no entries exist yet.

## 3. Invite link recovery

### API changes

`GET /business/invites` (existing route) — add `token` to the Prisma select, and build `link: \`${clientOrigin}/invite/${invite.token}\`` into each returned invite object, matching the shape already returned by `POST /business/invites`.

New route `POST /business/invites/:id/resend` (`requireOwner`):
- Looks up the invite by `id` + `businessId` (404 if not found or already accepted).
- Extends `expiresAt` to `now + 7 days` (same `INVITE_TTL_MS` constant already defined in `business.ts`).
- Re-sends the email via the existing best-effort `sendEmail` (same try/catch-and-ignore pattern already used in invite creation — a failed resend shouldn't fail the request, since the link is still shown either way).
- Returns `{ invite, link }`, same shape as creation.

### Client

`TeamSection.tsx`'s pending-invites list: each row gets a "Copy link" button (same copy-with-fallback pattern already built for backup codes — reuse the `legacyCopy` logic, likely worth extracting to a small shared `client/src/lib/clipboard.ts` helper since it'll now be used in two places) and a "Resend" button that calls the new endpoint and shows a brief confirmation.

### Testing

- `GET /business/invites` includes a working `link` field per invite.
- `POST /business/invites/:id/resend`: extends `expiresAt`, returns a link, is owner-gated, 404s for an unknown or already-accepted invite.
- Client: clicking "Copy link" on a pending invite copies that invite's link; clicking "Resend" calls the resend endpoint.

## Out of scope (explicitly deferred)

- Granular roles (e.g. accountant/sales-style scoped permissions) — flagged as the highest-leverage future improvement, but a bigger structural change deserving its own design pass.
- Ownership transfer — no way today to hand a business to another member; real gap, deferred.
- Real-time push for the activity feed (polling/websockets) — plain page-load fetch is enough at this scale.
- Logging every mutation type (items, settings fields) — can extend the `ActivityAction` enum later without a breaking change.
