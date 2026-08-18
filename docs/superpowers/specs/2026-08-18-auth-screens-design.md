# Billa — Login & Register Screens (Stage 5b)

Date: 2026-08-18

## Scope

The first real visual UI in the project: `/login` and `/register`, wired to
the already-built `/auth/*` endpoints and the app shell (`AuthContext`,
`apiClient`) from stage 5a. This is also where the app's typography and form
patterns get established for every later screen.

## Typography

- **`Fraunces`** (headlines, brand moments) — a warm, characterful serif
  with real personality, not a generic system-font look.
- **`Plus Jakarta Sans`** (UI/body text) — a distinctive geometric sans.
  Explicitly not Inter, per the "avoid the default Inter-everywhere look"
  instruction in the original brief.

Both self-hosted via `@fontsource` packages (no runtime dependency on Google
Fonts' CDN, keeps the app self-contained and avoids a render-blocking
external request).

## Layout

Split-screen `AuthLayout` component shared by both `/login` and `/register`:
left panel in the brand primary color (`--color-primary-500`) carrying the
Billa name and a short tagline, right panel (white) holds the form. A
credible, standard B2B auth pattern — deliberately not the "centered hero +
gradient" look the project brief calls out as a cliché to avoid, and built
with real depth (motion, not a flat color block).

## Forms

`react-hook-form` + `@hookform/resolvers/zod`, validated directly against
the existing `registerSchema`/`loginSchema` from `@billa/shared` — the same
schemas the server already validates against, so client and server share one
source of truth for what a valid signup/login payload looks like. This
becomes the pattern for every later form (onboarding, customer/item CRUD).

## Scope cut: no forgot-password link

Password reset needs an email-sending backend flow that doesn't exist yet.
Rather than a dead link, this stage omits "forgot password" entirely — it's
a clearly separate, later stage once email sending exists for other reasons
(document email-to-customer is already planned).

## Interactions

- `framer-motion` (already installed, unused until now) for button
  hover/press feedback and a subtle page-entry transition on each auth
  route.
- Submit loading state: the submit button itself morphs (label replaced by
  a spinner, disabled state) rather than a separate spinner element bolted
  on top.
- Errors: Zod validation failures show inline under each field
  (immediate, before any API call); API-level failures (wrong password,
  email already taken) show as a banner above the form, since those aren't
  tied to one specific field.

## Flow

- `/login` — email + password → `AuthContext.login()` → on success,
  `ProtectedRoute` naturally allows navigation to `/onboarding` (already
  built in stage 5a); on failure, banner shows the server's error.
- `/register` — email + password + business name → `AuthContext.register()`
  → same success path to `/onboarding`; 409 (email taken) or 400 (validation)
  shown appropriately.

## Not covered here

The onboarding wizard itself (business profile form, logo upload/preview,
color picker) is stage 5c.
