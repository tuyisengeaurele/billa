# Billa — Business Profile & Document Numbering (Stage 3a)

Date: 2026-08-18

## Scope

Backend only: endpoints to read/update the business profile fields and the
per-type document numbering config. No client UI in this stage — the client
still has no login/register screens at all, so there's nothing for a settings
page to be reached from yet. Client auth UI + onboarding UI is a separate,
later stage.

Logo upload, background removal, and color extraction are also separate
stages (3b/3c/3d per the earlier scope split).

## Field requirements

Per the auth stage design, signup only collects a business name. Everything
else — `tin`, `industry`, `phone`, `email`, `address`, `rraEbmNumber` — is
optional and skippable, filled in whenever the user gets to it. No onboarding
gate requires them.

## Endpoints

All under `/business`, behind `requireAuth`, scoped to `req.auth.businessId`
(never a business ID from the request body/params — tenant isolation is
enforced by always reading the ID off the authenticated session).

| Method | Path                 | Notes                                                        |
|--------|----------------------|---------------------------------------------------------------|
| GET    | `/business`          | returns the full business profile                             |
| PATCH  | `/business`          | updates any subset of the profile fields                      |
| GET    | `/business/sequences` | returns all 5 document types with prefix/nextNumber            |
| PUT    | `/business/sequences` | upserts prefix/nextNumber for one or more types                |

## Numbering defaults

Default prefixes, used only when computing a response (never persisted until
the user actually changes and saves a value, or a document of that type gets
created later):

- `INVOICE` → `INV-`
- `PROFORMA` → `PRO-`
- `DELIVERY_NOTE` → `DN-`
- `QUOTE` → `QTE-`
- `RECEIPT` → `RCT-`

All default to `nextNumber: 1`. `GET /business/sequences` merges saved
`DocumentSequence` rows with computed defaults for any type that has no row
yet, so the client always gets back exactly 5 entries.

## Validation (new `@billa/shared` schemas)

- `businessProfileSchema` — all fields optional: `name` (string, min 1 if
  provided), `tin`/`industry`/`phone`/`address`/`rraEbmNumber` (trimmed
  strings), `email` (validated email format if present).
- `documentSequenceSchema` — `type` (one of the existing `DOCUMENT_TYPES`),
  `prefix` (1–10 chars), `nextNumber` (positive integer).
- `updateSequencesSchema` — array of `documentSequenceSchema`, 1–5 entries,
  no duplicate `type` values within one request.

## Not covered here

Logo upload/storage, background removal, color extraction, and any client UI
(login, register, onboarding, settings screens) are separate stages.
