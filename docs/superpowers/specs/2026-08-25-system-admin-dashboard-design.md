# System Admin Dashboard — Design

## Context

Billa's only admin capability today is a read-only contact-message list, gated by a hardcoded `ADMIN_EMAILS` env var. This spec covers building out a full system admin dashboard, in the agreed build order:

1. Admin role model (DB-backed, replacing the env var)
2. Admin action audit trail
3. User & business directory
4. Trial extension
5. Suspend / reinstate accounts
6. Impersonation ("view as")
7. Metrics dashboard
8. System health

**Admin accounts:** `audittest@example.com` (the current `ADMIN_EMAILS` value) already has a Billa account and will be seeded as admin directly. `angeaureletuyisenge@gmail.com` does **not** have an account yet — it can't be flagged admin until it exists. Once it registers, promoting it is a normal admin action (subsystem 3's "toggle admin" — the first real admin can grant it, or I can flip it directly once you've registered, whichever is faster at the time).

**Architecture note:** admin pages get their own `AdminLayout` shell (a simple top nav: Users, Businesses, Audit Log, Metrics, System Health, back to app) rather than reusing the business `Sidebar` — admin is a cross-business, system-level view, and the current sidebar (business switcher, document type links) is meaningless in that context.

## 1. Admin role model

### Schema
`User.isAdmin Boolean @default(false)`.

### Migration
Hand-written: adds the column, then a data migration setting `isAdmin = true` for `audittest@example.com` (the only currently-configured admin with an existing account).

### Server
Rewrite `server/src/middleware/require-admin.ts`: instead of reading `ADMIN_EMAILS` and comparing against the JWT's email claim, it looks up `req.auth.userId` in the DB and checks `user.isAdmin`. Same exported name/signature, so `contact.ts`'s existing `requireAdmin` usage needs no changes.

`ADMIN_EMAILS` stops being read anywhere in code (the env var itself can stay in `.env`, just unused — not worth a config change for this).

Add `isAdmin` to the `user` object in every place the server already serializes it: `POST /auth/session` (both branches), `GET /auth/me`, `POST /auth/2fa/challenge` — the same four spots `totpEnabled` was added to earlier this session.

### Client
Add `isAdmin: boolean` to `AuthContext`'s `User` interface (mirrors `totpEnabled`). `Sidebar.tsx` shows an "Admin" link (to `/admin`) only when `user?.isAdmin` is true — today there's no nav entry to `/admin/messages` at all; admins have to know the URL. This link becomes the entry point to the whole admin shell.

### Testing
- `requireAdmin` middleware test: rewritten to check DB `isAdmin` instead of env var (existing `require-admin.test.ts` gets substantially rewritten, not just extended).
- `contact.ts` admin route tests: still pass with the new gate (a user with `isAdmin: true` can list messages; without, 403).
- Auth response shape tests: `isAdmin` present and correct in `/auth/me`, `/auth/session`.

## 2. Admin action audit trail

Built right after the role model so every admin action from subsystem 3 onward is logged from the moment it exists, not retrofitted.

### Schema
```prisma
model AdminAuditLogEntry {
  id           String   @id @default(cuid())
  adminUserId  String
  action       String
  targetType   String
  targetId     String
  metadata     Json?
  createdAt    DateTime @default(now())

  admin User @relation(fields: [adminUserId], references: [id])

  @@index([createdAt])
  @@index([adminUserId])
}
```

`action` is a plain string, not an enum this time — unlike `ActivityAction`, this log will grow new action types across five more subsystems in this same build, and a plain string avoids a migration per new admin action. Values used across subsystems 3–6: `ADMIN_GRANTED`, `ADMIN_REVOKED`, `TRIAL_EXTENDED`, `ACCOUNT_SUSPENDED`, `ACCOUNT_REINSTATED`, `IMPERSONATION_STARTED`, `IMPERSONATION_ENDED`.

### Server
`server/src/lib/admin-audit-log.ts`, mirroring `activity-log.ts`:
```ts
export async function logAdminAction(input: {
  adminUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}): Promise<void>
```

`GET /admin/audit-log` (admin-only, paginated, same convention as `GET /business/activity`) — returns entries newest-first with the acting admin's email joined in.

### Client
`client/src/pages/admin/AdminAuditLog.tsx` — a plain paginated table (admin email, action, target, timestamp). No fancy labels module needed here (unlike the business activity feed) since this is an internal tool for the one or two people running the company, not end-user-facing copy.

### Testing
- `logAdminAction` unit test.
- `GET /admin/audit-log`: returns entries, paginated, admin-gated (403 for a non-admin).

## 3. User & business directory

### Server
- `GET /admin/users` — paginated, searchable by email. Returns `{id, email, isAdmin, suspendedAt, trialEndsAt, currentPeriodEnd, plan, createdAt}` per row.
- `GET /admin/users/:id` — full detail: the above plus businesses owned and businesses they're a member of (name + id for each), so an admin can jump from a user to any business they touch.
- `GET /admin/businesses` — paginated, searchable by name. Returns `{id, name, ownerEmail, memberCount, documentCount, createdAt}`.
- `GET /admin/businesses/:id` — full detail: owner, member list (email + joined date), document/customer counts.
- `POST /admin/users/:id/toggle-admin` — flips `isAdmin`. Logs `ADMIN_GRANTED` or `ADMIN_REVOKED` depending on direction. This is how `angeaureletuyisenge@gmail.com` gets promoted once it has an account — no direct DB access needed after this ships. **An admin cannot revoke their own admin status** (`:id === req.auth.userId` → 400) — otherwise a lone admin could lock themselves out with one misclick.

All five routes live in a new `server/src/routes/admin.ts`, mounted at `/admin`, gated by `requireAuth` + `requireAdmin` at the router level (`adminRouter.use(requireAuth, requireAdmin)`), matching the `businessRouter.use(requireAuth)` convention already in the codebase.

### Client
- `client/src/components/admin/AdminLayout.tsx` — the shared shell (top nav, "back to app" link).
- `client/src/pages/admin/AdminUsers.tsx` — searchable table, reuses `usePaginatedList`.
- `client/src/pages/admin/AdminUserDetail.tsx` — one user's detail, businesses list, the "toggle admin" button (subsystems 4–6 add more buttons to this same page as they're built).
- `client/src/pages/admin/AdminBusinesses.tsx` — searchable table.
- `client/src/pages/admin/AdminBusinessDetail.tsx` — one business's detail, member list.
- Routes: `/admin`, `/admin/users`, `/admin/users/:id`, `/admin/businesses`, `/admin/businesses/:id`, `/admin/audit-log` (from subsystem 2), all wrapped in a new `AdminRoute` guard component (parallel to `ProtectedRoute`, but also checks `user.isAdmin` and redirects non-admins to `/dashboard`).

### Testing
- Each list/detail route: returns correct shape, paginates, search filters, 403 for non-admin, 401 for unauthenticated.
- `toggle-admin`: flips the flag, logs the right action, 403 for non-admin caller, 400 when an admin targets their own id.
- `AdminRoute` component test: redirects a non-admin, renders for an admin.

## 4. Trial extension

### Server
`POST /admin/users/:id/extend-trial`, body `{ days: number }` (shared schema `extendTrialSchema`, `days` a positive integer, capped at 365 to avoid fat-fingering a huge number). Sets `trialEndsAt` to `max(current trialEndsAt, now) + days` (so extending an already-active trial adds to it, and extending a lapsed one starts counting from today, not from whenever it expired). Logs `TRIAL_EXTENDED` with `{ days, newTrialEndsAt }`.

### Client
A small form on `AdminUserDetail.tsx`: a number input + "Extend trial" button, showing the current `trialEndsAt` next to it.

### Testing
- Extends correctly from both an active and a lapsed trial.
- Rejects a non-positive or over-365 value.
- Logs the action.
- 403 for non-admin.

## 5. Suspend / reinstate accounts

### Schema
`User.suspendedAt DateTime?` (nullable — matches the existing `acceptedAt`/`revokedAt` nullable-timestamp convention elsewhere in the schema).

### Enforcement
Two layers, deliberately not a per-request DB check (same reasoning as the member-removal fix earlier this session — a DB hit on every authenticated request is the wrong trade for an action this rare):
- **On suspend:** revoke every refresh token the user holds, across all businesses (`prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })`). Combined with the 15-minute access-token TTL, this locks them out within 15 minutes at the outside.
- **On login (`/auth/session`):** check `suspendedAt` on the existing-user branch; if set, `403 { error: "account_suspended" }` before issuing any session. This is free — the user row is already being fetched there.

### Server
- `POST /admin/users/:id/suspend` — sets `suspendedAt`, revokes refresh tokens, logs `ACCOUNT_SUSPENDED`. **An admin cannot suspend themselves** (`:id === req.auth.userId` → 400), same reasoning as the self-revocation guard above. Suspending another admin is allowed (a genuine "this admin account is compromised" scenario needs to work).
- `POST /admin/users/:id/reinstate` — clears `suspendedAt`, logs `ACCOUNT_REINSTATED`. (No token action needed — reinstated users just log in fresh.)

### Client
Suspend/Reinstate button on `AdminUserDetail.tsx` (whichever action applies given current `suspendedAt` state), with a confirmation modal before suspending (matches the existing "Deactivate customer" confirmation pattern in `Customers.tsx`).

### Testing
- Suspend revokes refresh tokens (a subsequent `/auth/refresh` 401s) and blocks fresh login (403 `account_suspended`).
- Reinstate clears the flag and login works again.
- Both log the right action.
- Can't suspend an already-suspended account twice into a broken state (idempotent — second suspend call just re-sets the same timestamp, no error).
- An admin gets 400 attempting to suspend themselves; suspending a different admin is allowed.

## 6. Impersonation ("view as")

The most sensitive piece — always logged, always visibly banner'd while active, single-click (no extra re-auth step) given Billa's SME scale and that only one or two trusted people hold admin rights. Flagging that trade explicitly: a larger org would want a re-auth or approval step here; Billa doesn't need that yet.

### Mechanism
`POST /admin/users/:id/impersonate` — admin-only. Rejects with 409 if the caller's own current token already carries `impersonatedBy` (already impersonating someone — must stop first, so impersonation sessions can't stack). Rejects with 400 if `:id === req.auth.userId` (impersonating yourself is meaningless). Resolves the target user's `lastActiveBusinessId` (falling back to their first owned business, same logic as `/auth/session`). Issues a session for the **target user**, but the access token JWT payload gains one optional field: `impersonatedBy: string` (the admin's own userId). Logs `IMPERSONATION_STARTED` with the target's id/email.

`POST /admin/impersonate/stop` — reads `impersonatedBy` off the current (impersonated) access token, and re-issues a normal session for that admin (their own userId, their own last active business). Logs `IMPERSONATION_ENDED`. If there's no `impersonatedBy` on the current token, 400 — nothing to stop.

`req.auth` type gains the optional `impersonatedBy?: string` field (server/src/middleware/require-auth.ts's existing module augmentation).

### Client
A persistent banner (rendered in `AppLayout`, above everything else) when the current session carries `impersonatedBy` — "Viewing as {email}. [Return to admin]" — calling the stop endpoint and redirecting to `/admin/users/:id`. `useAuth()`'s `/auth/me` response needs `impersonatedBy` surfaced so the client knows to show the banner (a `boolean` is enough client-side — the client doesn't need the admin's id, just "am I impersonating").

### Testing
- Starting impersonation issues a session as the target, with the admin's id embedded.
- Stopping returns a session as the original admin.
- Stop with no active impersonation 400s.
- Both start and stop are logged.
- A non-admin can't start impersonation.
- Starting impersonation while already impersonating 409s; impersonating yourself 400s.
- `AppLayout` shows the banner when impersonating, not otherwise.

## 7. Metrics dashboard

### Server
`GET /admin/metrics` — a handful of aggregate counts, computed with plain `count()`/`groupBy` (data volume here is dev/early-stage scale — no need for a time-series library or pre-aggregation table):
- Total users, total businesses.
- Active trials (`trialEndsAt > now`, `plan` null).
- Paying accounts (`plan` not null) — will likely read zero until a payment provider is chosen; the shape is still worth having ready.
- Signups in the last 7 and 30 days.
- Documents created in the last 7 and 30 days.
- A 30-day daily signup count for a simple sparkline, via `prisma.$queryRaw` with `date_trunc('day', "createdAt")` (Prisma's query builder doesn't support date-trunc grouping natively).

### Client
`client/src/pages/admin/AdminMetrics.tsx` — stat tiles for the counts, one small sparkline for the 30-day signup trend (reaching for the `dataviz` skill's guidance on a minimal single-series chart, not a chart library).

### Testing
- Each count reflects seeded data correctly (create N users/businesses/documents at known dates, assert the numbers).
- 403 for non-admin.

## 8. System health

The lightest piece, deliberately last — it's about the two existing background-job HTTP endpoints (`POST /documents/recurring/generate-due`, `POST /documents/overdue/send-reminders`), which something external (a scheduler) already calls periodically. "Health" here means: did they run, when, and did they succeed.

### Schema
```prisma
model JobRunLog {
  id           String   @id @default(cuid())
  jobName      String
  ranAt        DateTime @default(now())
  succeeded    Boolean
  resultCount  Int?
  errorMessage String?
}
```

### Server
Both existing job routes (`documents.ts`) write a `JobRunLog` row after they run — success with `resultCount` (the number generated/sent), or failure with `errorMessage` if the handler throws (needs a try/catch added around each that currently doesn't have one, recording failure before re-throwing/responding 500).

`GET /admin/system-health` — returns the most recent `JobRunLog` row per `jobName`, plus a basic DB-connectivity check (`SELECT 1`).

### Client
`client/src/pages/admin/AdminSystemHealth.tsx` — two cards (one per job) showing last-run time, success/failure, and result count; a DB-connectivity indicator.

### Testing
- Each job route writes a `JobRunLog` row on success, with the right `resultCount`.
- A forced failure (mock the underlying function to throw) still writes a row, with `succeeded: false` and an error message, and the route still responds the way it does today (this must not change existing job-route behavior on the happy path — only add logging).
- `GET /admin/system-health` returns the latest row per job and the DB check.

## Cross-cutting

- **`AdminRoute` guard** (subsystem 3) is the single gate for every admin page — built once, reused by all of them.
- **Every mutating admin route logs to `AdminAuditLogEntry`** from subsystem 3 onward — no exceptions, since accountability is the entire point of building the audit trail second.
- **No new npm dependencies** — everything above is buildable with what's already in the project (Express, Prisma, React, the existing `usePaginatedList` hook).

## Explicitly out of scope for this build

- Payment/plan changes beyond trial extension — payments are still descoped (no working provider).
- Email notifications to a user when suspended/reinstated — could be a fast follow using the existing `sendEmail` helper, not included here to keep this build's surface area bounded.
- Any UI for changing `ADMIN_EMAILS`-style config — admin grant/revoke is entirely through subsystem 3's toggle button now.
