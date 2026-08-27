# Consent-Gated Impersonation, Design

## Context

Two distinct actors exist in Billa: the **system admin** (the platform owner, not affiliated with any business, gated by the `ADMIN_EMAILS` allowlist) and a **business owner** (the person who created a specific business, distinct from the members they've invited into it). Today, only the system admin can impersonate, and only instantly: `POST /admin/users/:id/impersonate` issues a session for any user in the system with no consent step at all, just an audit log entry after the fact.

Two changes came out of this brainstorm:

1. Impersonation becomes **consent-gated**, modeled on how Windows Remote Assistance works: the requester sends a request, the target sees a modal naming who's asking and why, and access only begins once they click Allow.
2. **Business owners get their own, narrower version of this**: an owner can request to impersonate one of their own invited members (never the other way around, and never a member impersonating anyone). Both capabilities exist side by side, generalized on one shared mechanism rather than built twice.

One deliberate asymmetry: the system admin case keeps an offline override (proceed without live consent, heavily logged) for genuine support urgency when a customer isn't currently online. The owner case does not get this override, since the owner already has full access to their own business's data regardless (impersonating a member changes what UI they see, not what data they can reach), so there's no urgent-access case to protect against.

## 1. Data model

```prisma
enum ImpersonationRequestStatus {
  PENDING
  APPROVED
  DENIED
  EXPIRED
  OVERRIDDEN
}

model ImpersonationRequest {
  id           String                     @id @default(cuid())
  requesterId  String
  targetUserId String
  businessId   String
  reason       String?
  status       ImpersonationRequestStatus @default(PENDING)
  requestedAt  DateTime                   @default(now())
  respondedAt  DateTime?
  expiresAt    DateTime
  redeemedAt   DateTime?
  overrideReason String?

  requester User     @relation("ImpersonationRequester", fields: [requesterId], references: [id])
  target    User     @relation("ImpersonationTarget", fields: [targetUserId], references: [id])
  business  Business @relation(fields: [businessId], references: [id])

  @@index([targetUserId, status])
  @@index([requesterId, status])
}
```

`expiresAt` is `requestedAt` plus 2 minutes, a deliberately short, "are you there right now" window matching the live nature of the interaction. `PENDING` past its `expiresAt` is treated as expired at read time (no cleanup job needed, same way other short-lived state in this codebase avoids a background job when a computed check is enough).

## 2. Requesting impersonation

**`POST /impersonation-requests`**, body `{ targetUserId, reason }`.

Authorization (either one qualifies, checked in this order):
- **System admin**: `req.auth.isAdmin` (existing check). `businessId` resolves the same way `POST /admin/users/:id/impersonate` already does today: the target's `lastActiveBusinessId`, falling back to their first-owned business.
- **Business owner**: `business.ownerId === req.auth.userId` for the requester's current business, and `targetUserId` must correspond to a `BusinessMember` row of that exact business. `businessId` is the owner's own current business. A regular (non-owner) member calling this gets 403, regardless of who they name as the target.

Both paths reject `targetUserId === req.auth.userId` (existing `cannot_impersonate_self` check, unchanged) and reject if the requester already has another request pending.

Creates a `PENDING` row and returns its id. The requester's UI moves into a waiting state (a spinner, "Waiting for approval").

## 3. Responding to a request

The target's client polls **`GET /impersonation-requests/pending-for-me`** every few seconds while logged in (a new lightweight hook mounted in `AppLayout`, so it's active regardless of which page they're on, structurally similar to how `AnnouncementBanner` already fetches on mount, just on an interval instead of once). If a `PENDING`, unexpired request names them as target, a modal appears: "[Requester name] wants to view your account as you. [Reason, if provided]. Allow / Deny," directly mirroring the Windows Remote Assistance wording the brainstorm was modeled on.

**`POST /impersonation-requests/:id/approve`**, callable only by the named target, only while `PENDING` and unexpired. Sets `status: APPROVED`, `respondedAt: now()`. Does **not** issue a session itself: the approval happens in the target's browser, but the session cookies need to land in the requester's browser, so issuance is a separate step (section 4).

**`POST /impersonation-requests/:id/deny`**, same authorization, sets `status: DENIED`.

## 4. Redeeming an approved request

The requester's client, still in its waiting state, polls **`GET /impersonation-requests/:id`** (own request only) for a status change.

- **`APPROVED`**: the requester's client calls **`POST /impersonation-requests/:id/redeem`**, callable only by the original requester, only once (`redeemedAt` must be null), only while `status: APPROVED`. This is what actually calls the existing `issueSession(res, targetUserId, businessId, requesterId)`, setting cookies on the requester's own response, then sets `redeemedAt: now()`. The requester's client redirects into the impersonated session exactly like the instant flow works today.
- **`DENIED`**: the requester's UI shows "Access denied."
- **`EXPIRED`** (computed: still `PENDING` past `expiresAt`): the requester's UI shows "No response, request expired." For a system admin only, an **override** option appears here (never for a business owner, section 5).

## 5. Admin-only override

**`POST /impersonation-requests/:id/override`**, admin-only (rejected with 403 for a business-owner-initiated request, enforced by checking the original request's authorization path, not just the caller's role), only while the request is `EXPIRED`, requires a mandatory `overrideReason` in the body (distinct from the original, optional `reason`). Sets `status: OVERRIDDEN`, calls `issueSession` directly, sets `redeemedAt`. Logged via the existing `logAdminAction` helper under a new, distinctly-named action (`IMPERSONATION_OVERRIDDEN`, separate from the normal `IMPERSONATION_STARTED`) so it stands out in the admin audit log rather than blending in with consented sessions.

## 6. Visibility to the target after the fact

For the owner-to-member path specifically: a successful redemption writes a new `ActivityLogEntry` (the existing business activity log from the team-collaboration work) with a new action `MEMBER_IMPERSONATION_STARTED`, metadata including who was impersonated. Since members can already see this log (built to serve "each member's own activity feed"), a member can see, after the fact, that they were impersonated and when, on top of having consented live in the moment. Nothing hidden.

The admin path keeps its existing `logAdminAction` trail (`IMPERSONATION_STARTED` for a normal consented session, `IMPERSONATION_OVERRIDDEN` for the override case), unchanged in visibility (admin-only, as today).

## 7. UI entry points

- **`AdminUserDetail.tsx`**: existing "Impersonate" button now creates a request and shows the waiting/approve/deny/expired states described above, instead of issuing a session on click.
- **Business Settings, team section**: a new "Impersonate" action next to each member row, visible only when the current user is the business owner (never shown to a member, whether looking at the owner's row, their own row, or another member's row).
- **Consent modal**: one new shared component (`ImpersonationRequestModal.tsx`), mounted once in `AppLayout`, driven by the polling hook from section 3. Works identically regardless of whether the requester was an admin or an owner, since the target-facing experience is the same either way: someone is asking to see their account.

## Testing approach

Server-side route tests: request creation authorization for both paths (admin, business owner, and the 403 for a plain member); approve/deny/redeem state transitions and their one-time/authorization guards; expiry computed correctly; the admin-only override path, including its 403 when attempted against an owner-initiated request; the activity log entry for the owner path. Client tests for the polling hook, the consent modal's allow/deny actions, and the requester-side waiting/approved/denied/expired states. Full client and server suites plus `tsc --noEmit` on all three workspaces before considering this done, same bar as every other batch this session.
