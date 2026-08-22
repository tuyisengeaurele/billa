# Landing Page Design

**Goal:** Give Billa a real marketing home page instead of `/` bouncing straight into the app. One page, aimed at a Rwandan SME owner who has never heard of Billa, that reads as a considered, premium product rather than a templated AI-generated SaaS page.

## Routing

Today `/` unconditionally redirects to `/onboarding`, which `ProtectedRoute` then bounces unauthenticated visitors away from to `/login`. This changes to:

- Logged out: `/` renders the landing page.
- Logged in: `/` redirects straight to `/dashboard`, skipping marketing copy for people who already have an account.

This is a small root-route component that reads `useAuth()` and picks one of the two, not a change to `ProtectedRoute` itself.

## Voice and constraints

- Short sentences. No em dashes anywhere on the page.
- No SaaS-speak ("revolutionize," "streamline," "empower," "seamless").
- No fabricated statistics, quotes, or customer logos. Billa has no customers yet; the page doesn't pretend otherwise.
- No claim of RRA/EBM tax-authority integration anywhere on the page. That's explicitly not built. The page may truthfully mention that a business's own EBM number appears on its invoices (an existing profile field), but must not imply automatic compliance reporting.
- Visuals reuse the product's real design system exactly: Fraunces for display type, Plus Jakarta Sans for body text, the existing magenta/blue palette (`--color-primary-*`, `--color-secondary*`). No new fonts or colors introduced for this page.

## Sections

1. **Header** — logo mark, wordmark, "Log in" link, primary "Start free trial" button. No nav menu.
2. **Hero** — one headline stating the value proposition in concrete terms (documents, not vague "grow your business" language), one supporting sentence, primary CTA button. Visual: a stylized rendering of an actual Billa invoice (reusing the real document template look), not stock illustration.
3. **Who it's for** — a short paragraph naming the real problem: invoices currently done by hand, in Word, or in Excel, with nothing built for RWF pricing or Mobile Money workflows.
4. **What it does** — the five document types (invoice, proforma invoice, delivery note, quote, receipt), presented as one editorial block, not a generic three-icon feature grid.
5. **How it works** — three steps: add your business details once, create a document in seconds, send or download a finished PDF.
6. **Pricing** — 6,500 RWF/month or 65,000 RWF/year stated plainly, the 14-day free trial, and that no card is required to start.
7. **FAQ** — practical questions a Rwandan SME owner would actually ask (what documents can I create, does it work on mobile, can my accountant see my EBM number on invoices, what happens after the trial). No compliance-automation claims, per the constraint above.
8. **Final CTA** — repeats the trial offer and the price.
9. **Footer** — logo, a contact email, copyright line, a link back to login.

## Architecture

- New file `client/src/pages/Landing.tsx`, a single self-contained page component (matching the codebase's one-file-per-page convention). Not wrapped in `AppLayout` or `AuthLayout` — it gets its own minimal header/footer since its navigation needs (no logout, no document nav, a "Log in" link instead) don't match either existing layout.
- New file `client/src/components/RootRoute.tsx`: reads `useAuth()`; while `isLoading` is true, renders nothing (avoids a flash of the wrong page); otherwise renders `<Landing />` if there's no user, or `<Navigate to="/dashboard" replace />` if there is.
- In `client/src/App.tsx`, the existing `<Route path="/" element={<Navigate to="/onboarding" replace />} />` is replaced with `<Route path="/" element={<RootRoute />} />`, placed outside the `<ProtectedRoute>` group since it must be reachable by logged-out visitors.
- CTA buttons ("Start free trial") link to `/register`; "Log in" links to `/login` — both existing routes, unchanged.

## Testing

`client/src/components/RootRoute.test.tsx`: renders the landing page when logged out, redirects to `/dashboard` when logged in, renders nothing while auth state is still loading.

`client/src/pages/Landing.test.tsx`: the headline and pricing figures (6,500 RWF, 65,000 RWF, 14-day trial) render; the primary CTA links to `/register`; the header's "Log in" link goes to `/login`; the FAQ section contains no claim of automatic RRA/EBM reporting (a content-safety assertion, checked by asserting the absence of that language).
