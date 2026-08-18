# Billa — Auth Flow (Stage 2)

Date: 2026-08-18

## Scope

Register, login, refresh, logout, and the `requireAuth` middleware later stages
build tenant isolation on top of. Full business registration (TIN, industry,
logo, colors) is a separate stage — signup only collects enough to satisfy the
non-nullable `User.businessId` FK.

## Signup / business creation

`POST /auth/register` takes `email`, `password`, and `businessName`. In one
transaction it creates a `Business` (name only, everything else left null) and
the owner `User`, then logs the user in immediately — no email verification
for v1, to keep signup frictionless and avoid standing up transactional email
infra before it's otherwise needed (email-to-customer is a later stage anyway).
The subsequent business-registration stage edits this same `Business` row.

## Token strategy

- **Access token**: JWT, 15 min TTL, httpOnly cookie, path `/`. Claims:
  `userId`, `businessId`. Lets every route scope tenant queries without an
  extra DB lookup just to resolve which business a request belongs to.
- **Refresh token**: opaque random string, not a JWT. Only its hash is
  persisted (`RefreshToken.tokenHash`) — a leaked DB doesn't hand over usable
  tokens. Cookie scoped to path `/auth/refresh` so it's never sent on ordinary
  API calls.
- **Rotation + reuse detection**: every `/auth/refresh` call revokes the
  presented token and issues a new one sharing the same `family`. If a
  *revoked* token is presented again — a signal it was stolen and the thief
  raced the legitimate user — the entire family is revoked, forcing re-login.
- **Passwords**: bcrypt, cost factor 12.

## Endpoints

| Method | Path              | Notes                                              |
|--------|-------------------|-----------------------------------------------------|
| POST   | `/auth/register`  | creates Business + User, sets cookies, rate-limited  |
| POST   | `/auth/login`     | verifies password, sets cookies, rate-limited        |
| POST   | `/auth/refresh`   | rotates refresh token                                |
| POST   | `/auth/logout`    | revokes refresh token, clears cookies                |
| GET    | `/auth/me`        | returns current user + business (session check)      |

`/auth/me` isn't in the original feature list but is necessary for the client
to know whether a session exists on load.

## Middleware

`requireAuth` verifies the access token cookie and attaches
`{ userId, businessId }` to `req`. Every route added in later stages
(customers, items, documents) uses `req.businessId` to scope Prisma queries —
this is the single choke point tenant isolation depends on, so it's built now
even though nothing downstream exists yet.

## Rate limiting

`express-rate-limit` on `/auth/register` and `/auth/login`, per the security
requirements in the original spec.

## Not covered here

Full business registration (logo upload, background removal, color
extraction, TIN/industry/etc.), customer/item CRUD, and everything after
remain separate stages.
