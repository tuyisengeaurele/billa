# Billa — Repo Scaffold & Data Model (Stage 1)

Date: 2026-08-18

## Scope

First stage of the build order: repo structure and the Prisma schema everything
else builds on. No feature UI, no auth logic, no document engine yet — those are
separate stages with their own design/plan cycles.

## Repo structure

npm workspaces monorepo: `client`, `server`, `shared`.

Single repo instead of separate client/server repos because `shared` holds Zod
schemas both sides import (validation for auth payloads, document line items,
customer/item shapes). Splitting repos would mean hand-syncing that logic or
publishing an internal package — not worth it for a solo-dev v1. No Turborepo/Nx;
npm workspaces alone is enough at three packages.

## Data model decisions

- **Money is `Int`, not `Decimal`.** RWF has no subunits in practice, so storing
  whole francs avoids decimal overhead entirely. `quantity` stays `Decimal(10,2)`
  because quantities can be fractional (kg, hours); `taxRate` stays
  `Decimal(5,2)` since it's a percentage, not currency.
- **RWF only, no currency field.** v1 is Rwanda-only; multi-currency would add
  schema and formatting work with no current use case. Revisit if the product
  expands beyond Rwanda.
- **Line items snapshot their data.** `DocumentLine.description` and `unitPrice`
  are copied from `Item` at creation time rather than always joined live, so
  editing a saved item later doesn't silently rewrite a historical, possibly
  already-sent document. `itemId` is kept as an optional reference for
  traceability back to the catalog item.
- **Numbering is its own table (`DocumentSequence`)**, keyed on
  `(businessId, type)`, rather than fields on `Business`. Keeps per-type
  sequences (invoice #, quote #, ...) independent and makes atomic
  increment-on-finalize straightforward.
- **Proforma → Invoice conversion is a self-relation** on `Document`
  (`convertedFromId` / `convertedTo`) — one link, queryable from either side, no
  separate join table needed for a 1:1 relationship.
- **`Customer` and `Item` use `isActive`, not hard delete.** Both are referenced
  by historical documents via foreign key; hard-deleting one would break past
  documents. "Removing" one from quick-add lists just flips the flag.
- **`template` is stored per-document, not just read from `Business.defaultTemplate`
  at render time.** If the business's default template changes later, previously
  finalized documents still regenerate identically.
- **No roles/teams table yet.** The spec only calls for single-owner-per-business
  auth for v1. `User.businessId` is a plain foreign key; adding a `role` enum
  or many-to-many membership is deferred until team accounts are actually needed.
- **Refresh tokens are persisted (`RefreshToken` model)**, not purely stateless
  JWTs. Rotation with reuse detection requires being able to look up and revoke
  a specific token, which stateless JWTs alone can't do.

## Brand palette

CSS variables in `client/src/index.css`, consumed via Tailwind config
(`client/tailwind.config.ts`):

- Primary `#c2185b` (raspberry/magenta) with a light tint (`#f6d7e4`) and dark
  shade (`#8f1144`) generated off it.
- Secondary `#e0f2fe` (pale sky blue) kept as given — it's a light/background
  tone by design, not meant to carry text. Added `--color-secondary-deep`
  (`#0369a1`) for cases needing a readable blue accent.
- Standard neutral gray scale (50–900) and success/error/warning pairs (each
  with a solid color + light background variant for banners/badges).

Both exact brand hex values are used unmodified; nothing was "improved" or
substituted per project instructions.

## Not covered here

Auth flow, business registration/logo pipeline, document engine, PDF rendering,
and everything after are separate stages per the build order in the README.
