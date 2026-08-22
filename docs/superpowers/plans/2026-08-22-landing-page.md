# Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/`'s current unconditional redirect into the app with a real marketing landing page for logged-out visitors, while logged-in visitors still land on `/dashboard` immediately.

**Architecture:** A `RootRoute` component picks between the new `Landing` page and a redirect to `/dashboard` based on auth state. `Landing` is a single, self-contained page (its own minimal header/footer, not `AppLayout`/`AuthLayout`) built from the existing design system (Fraunces, Plus Jakarta Sans, the established color tokens) plus one small decorative subcomponent, `InvoicePreview`, for the hero visual.

**Tech Stack:** React, React Router, framer-motion (already a dependency, used by `AuthLayout`), Vitest, React Testing Library.

---

### Task 1: Root route

**Files:**
- Create: `client/src/components/RootRoute.tsx`
- Create: `client/src/components/RootRoute.test.tsx`
- Modify: `client/src/App.tsx`

This task's tests depend on `Landing` existing (Task 2), so write the test and component together here but expect the "shows the landing page" assertion to only pass once Task 2 lands. To keep this task's own verification meaningful without that dependency, its test only checks the redirect behavior for logged-in users here; Task 2 extends coverage for the logged-out case once `Landing` exists.

- [ ] **Step 1: Write the failing test**

Create `client/src/components/RootRoute.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { RootRoute } from "./RootRoute";

function mockFetch(loggedIn: boolean) {
  vi.spyOn(global, "fetch").mockImplementation(async () =>
    loggedIn
      ? new Response(
          JSON.stringify({
            user: { id: "u1", email: "owner@example.com" },
            business: { id: "b1", name: "Kigali Traders" },
          }),
          { status: 200 },
        )
      : new Response("{}", { status: 401 }),
  );
}

function renderRootRoute() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route path="/dashboard" element={<p>Dashboard page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("RootRoute", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects to the dashboard when logged in", async () => {
    mockFetch(true);

    renderRootRoute();

    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/components/RootRoute.test.tsx`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Write a placeholder Landing export so RootRoute can import it**

Create `client/src/pages/Landing.tsx` with a minimal placeholder (Task 2 replaces this fully):

```tsx
export default function Landing() {
  return <div>Landing</div>;
}
```

- [ ] **Step 4: Write the root route component**

Create `client/src/components/RootRoute.tsx`:

```tsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Landing from "../pages/Landing";

export function RootRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Landing />;
}
```

- [ ] **Step 5: Wire it into App.tsx**

In `client/src/App.tsx`, remove `Navigate` from the react-router-dom import (it's no longer used directly in this file) and add:

```ts
import { RootRoute } from "./components/RootRoute";
```

Replace:

```tsx
          <Route path="/" element={<Navigate to="/onboarding" replace />} />
```

with:

```tsx
          <Route path="/" element={<RootRoute />} />
```

Move this route outside the `<ProtectedRoute>` group if it isn't already (it already is, since the existing redirect route sits after the closing `</Route>` of the protected group) — no structural change needed beyond the element swap.

- [ ] **Step 6: Run it to confirm it passes**

Run: `cd client && npx vitest run src/components/RootRoute.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/RootRoute.tsx client/src/components/RootRoute.test.tsx client/src/pages/Landing.tsx client/src/App.tsx
git commit -m "add a root route that shows the landing page to logged-out visitors"
```

---

### Task 2: Landing page

**Files:**
- Create: `client/src/components/landing/InvoicePreview.tsx`
- Modify: `client/src/pages/Landing.tsx`
- Create: `client/src/pages/Landing.test.tsx`
- Modify: `client/src/components/RootRoute.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `client/src/pages/Landing.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Landing from "./Landing";

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

describe("Landing", () => {
  it("shows the headline", () => {
    renderLanding();

    expect(screen.getByRole("heading", { name: /stop building invoices by hand/i })).toBeInTheDocument();
  });

  it("shows both pricing figures and mentions the free trial", () => {
    renderLanding();

    expect(screen.getByText("6,500 RWF")).toBeInTheDocument();
    expect(screen.getByText("65,000 RWF")).toBeInTheDocument();
    expect(screen.getAllByText(/14 days free|14-day free trial/i).length).toBeGreaterThan(0);
  });

  it("links the primary CTA to registration and the login links to login", () => {
    renderLanding();

    const ctaLinks = screen.getAllByRole("link", { name: /start free trial/i });
    expect(ctaLinks.length).toBeGreaterThan(0);
    ctaLinks.forEach((link) => expect(link).toHaveAttribute("href", "/register"));

    const loginLinks = screen.getAllByRole("link", { name: /^log in$/i });
    expect(loginLinks.length).toBeGreaterThan(0);
    loginLinks.forEach((link) => expect(link).toHaveAttribute("href", "/login"));
  });

  it("does not claim automatic RRA or EBM reporting", () => {
    renderLanding();

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).not.toMatch(/automatically (report|file|submit).{0,40}(rra|ebm)/i);
    expect(bodyText).not.toMatch(/(rra|ebm) compliant/i);
  });
});
```

Add this test inside the existing `describe("RootRoute", ...)` block in `client/src/components/RootRoute.test.tsx`, right before the closing `});`:

```tsx
  it("shows the landing page when logged out", async () => {
    mockFetch(false);

    renderRootRoute();

    expect(await screen.findByRole("link", { name: /start free trial/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/Landing.test.tsx src/components/RootRoute.test.tsx`
Expected: FAIL — the placeholder `Landing` has none of this content.

- [ ] **Step 3: Write the invoice preview component**

Create `client/src/components/landing/InvoicePreview.tsx`:

```tsx
import { formatRwf } from "@billa/shared";

export function InvoicePreview() {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500">
            <img src="/logo.png" alt="" className="h-4 w-4" style={{ filter: "brightness(0) invert(1)" }} />
          </span>
          <span className="font-display text-base font-semibold text-neutral-900">Kigali Traders</span>
        </div>
        <div className="text-right">
          <p className="font-sans text-xs uppercase tracking-wide text-neutral-400">Invoice</p>
          <p className="font-sans text-sm font-semibold text-neutral-900">INV-0004</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 font-sans text-sm text-neutral-600">
        <div className="flex items-center justify-between">
          <span>3 bags of cement</span>
          <span>{formatRwf(45000)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Delivery, Kicukiro</span>
          <span>{formatRwf(5000)}</span>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-1 border-t border-neutral-100 pt-4 font-sans text-sm text-neutral-600">
        <div className="flex items-center justify-between">
          <span>Subtotal</span>
          <span>{formatRwf(50000)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Tax (18%)</span>
          <span>{formatRwf(9000)}</span>
        </div>
        <div className="flex items-center justify-between font-display text-base font-semibold text-neutral-900">
          <span>Total</span>
          <span>{formatRwf(59000)}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the landing page**

Replace the full contents of `client/src/pages/Landing.tsx`:

```tsx
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { formatRwf, PLAN_PRICES } from "@billa/shared";
import { InvoicePreview } from "../components/landing/InvoicePreview";

const DOCUMENT_TYPES = [
  { name: "Invoices", description: "Bill customers with itemized totals and RWF tax calculations." },
  {
    name: "Proforma invoices",
    description: "Send a formal quote before the sale, then convert it to an invoice in one click.",
  },
  { name: "Delivery notes", description: "Confirm what was delivered, separate from what's being billed." },
  { name: "Quotes", description: "Give a customer a price before they commit." },
  { name: "Receipts", description: "Confirm that payment was received." },
];

const STEPS = [
  {
    title: "Add your business once",
    description: "Your name, logo, TIN, and EBM number, saved for every document after.",
  },
  {
    title: "Create a document in seconds",
    description: "Pick a customer, add line items, and Billa handles the numbering and totals.",
  },
  {
    title: "Send or download a finished PDF",
    description: "Ready to email or print, formatted like it came from a design studio.",
  },
];

const FAQS = [
  {
    question: "What documents can I create?",
    answer: "Invoices, proforma invoices, delivery notes, quotes, and receipts, each with its own numbering sequence.",
  },
  {
    question: "Does Billa handle RRA EBM reporting?",
    answer:
      "Not yet. You can add your business's own EBM number so it appears on your invoices, but Billa doesn't connect to RRA's EBM system directly.",
  },
  {
    question: "What happens after my trial ends?",
    answer: `You can still view and download everything you've already created. To create new documents, subscribe for ${formatRwf(PLAN_PRICES.MONTHLY)} a month or ${formatRwf(PLAN_PRICES.ANNUAL)} a year.`,
  },
  {
    question: "Can I use it for more than one business?",
    answer: "Yes. One account can manage up to three businesses, with one subscription covering all of them.",
  },
  {
    question: "How do I pay?",
    answer: "By Mobile Money or card.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500">
            <img src="/logo.png" alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
          </span>
          <span className="font-display text-lg font-semibold text-neutral-900">Billa</span>
        </div>
        <div className="flex items-center gap-6">
          <Link to="/login" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Log in
          </Link>
          <Link
            to="/register"
            className="rounded-lg bg-primary-500 px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
          >
            Start free trial
          </Link>
        </div>
      </header>

      <section className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-6 py-16 lg:flex-row lg:py-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex-1"
        >
          <p className="font-sans text-sm font-semibold uppercase tracking-[0.2em] text-primary-500">
            Documents for Rwandan businesses
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight text-neutral-900 lg:text-5xl">
            Stop building invoices by hand.
          </h1>
          <p className="mt-6 max-w-lg font-sans text-lg text-neutral-600">
            Billa creates professional invoices, proforma invoices, delivery notes, quotes, and receipts in Rwandan
            francs. Add your business once, then every document after that takes seconds.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <Link
              to="/register"
              className="rounded-lg bg-primary-500 px-6 py-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
            >
              Start free trial
            </Link>
            <span className="font-sans text-sm text-neutral-500">14 days free. No card required.</span>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0, rotate: -3 }}
          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          className="relative flex flex-1 items-center justify-center"
        >
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ backgroundImage: "radial-gradient(circle at 60% 40%, rgba(194,24,91,0.12) 0, transparent 55%)" }}
          />
          <InvoicePreview />
        </motion.div>
      </section>

      <section className="border-t border-neutral-100 bg-neutral-50 px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-semibold text-neutral-900">
            Built for how Rwandan businesses actually invoice
          </h2>
          <p className="mt-6 font-sans text-lg text-neutral-600">
            Most small businesses in Rwanda still write invoices in Word, Excel, or by hand. It works until a
            customer asks for something more formal, or you lose track of what you've already numbered. Billa gives
            every document a real sequence, RWF totals, and a design that looks considered, without asking you to
            learn accounting software you don't need.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-center font-display text-3xl font-semibold text-neutral-900">
          Every document your business sends
        </h2>
        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {DOCUMENT_TYPES.map((doc) => (
            <div key={doc.name} className="rounded-xl border border-neutral-100 p-6">
              <h3 className="font-display text-lg font-semibold text-neutral-900">{doc.name}</h3>
              <p className="mt-2 font-sans text-sm text-neutral-600">{doc.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-neutral-100 bg-neutral-50 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center font-display text-3xl font-semibold text-neutral-900">
            From sign-up to your first invoice in three steps
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <div key={step.title}>
                <span className="font-display text-2xl font-semibold text-primary-500">{index + 1}</span>
                <h3 className="mt-3 font-display text-lg font-semibold text-neutral-900">{step.title}</h3>
                <p className="mt-2 font-sans text-sm text-neutral-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="text-center font-display text-3xl font-semibold text-neutral-900">Simple pricing</h2>
        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 p-8">
            <p className="font-sans text-sm font-semibold uppercase tracking-wide text-neutral-500">Monthly</p>
            <p className="mt-4 font-display text-4xl font-semibold text-neutral-900">
              {formatRwf(PLAN_PRICES.MONTHLY)}
            </p>
            <p className="mt-1 font-sans text-sm text-neutral-500">per month</p>
          </div>
          <div className="rounded-2xl border border-primary-500 p-8">
            <p className="font-sans text-sm font-semibold uppercase tracking-wide text-primary-500">Annual</p>
            <p className="mt-4 font-display text-4xl font-semibold text-neutral-900">
              {formatRwf(PLAN_PRICES.ANNUAL)}
            </p>
            <p className="mt-1 font-sans text-sm text-neutral-500">per year, two months free</p>
          </div>
        </div>
        <p className="mt-8 text-center font-sans text-sm text-neutral-500">
          Every plan starts with a 14-day free trial. No card required.
        </p>
      </section>

      <section className="border-t border-neutral-100 bg-neutral-50 px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center font-display text-3xl font-semibold text-neutral-900">Questions</h2>
          <div className="mt-12 flex flex-col gap-8">
            {FAQS.map((faq) => (
              <div key={faq.question}>
                <h3 className="font-display text-lg font-semibold text-neutral-900">{faq.question}</h3>
                <p className="mt-2 font-sans text-sm text-neutral-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="font-display text-3xl font-semibold text-neutral-900">Start your free trial</h2>
        <p className="mt-4 font-sans text-lg text-neutral-600">14 days free. No card required. No auto-renewal, ever.</p>
        <Link
          to="/register"
          className="mt-8 inline-block rounded-lg bg-primary-500 px-6 py-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
        >
          Start free trial
        </Link>
      </section>

      <footer className="border-t border-neutral-100 px-6 py-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-500">
              <img src="/logo.png" alt="" className="h-4 w-4" style={{ filter: "brightness(0) invert(1)" }} />
            </span>
            <span className="font-display text-sm font-semibold text-neutral-900">Billa</span>
          </div>
          <p className="font-sans text-sm text-neutral-500">© 2026 Billa</p>
          <Link to="/login" className="font-sans text-sm text-neutral-500 hover:text-neutral-900">
            Log in
          </Link>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `cd client && npx vitest run src/pages/Landing.test.tsx src/components/RootRoute.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 6: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/landing/InvoicePreview.tsx client/src/pages/Landing.tsx client/src/pages/Landing.test.tsx client/src/components/RootRoute.test.tsx
git commit -m "build the landing page"
```

---

### Task 3: Visual verification and design polish

**Files:** none planned in advance — this task is a real-browser design pass, and any fixes it produces get their own commit(s).

This is the step that actually answers "does this look like a considered, premium product" — something no text-assertion test can verify. Load the **frontend-design** skill before starting this task; it covers what separates a distinctive layout from a generic AI-templated one, and apply that judgment here rather than accepting the first render as finished.

- [ ] **Step 1: Load the page and take a full-page screenshot at desktop width**

With the client dev server running, navigate to `/` in a fresh (logged-out) session and screenshot it. Check specifically for:

1. Does the hero read as intentional, or does it look like a stock "centered headline + gradient blob" template? Adjust spacing, alignment, or the invoice mockup's presence/rotation until it doesn't.
2. Type hierarchy: is it obvious what to read first (headline), second (subhead), third (CTA)? Fraunces headline sizes should feel confident, not timid.
3. Whitespace: premium pages breathe. Check that section padding (`py-16`/`py-20`/`py-24` as written) doesn't feel cramped at real screen sizes, and tighten or loosen as needed.
4. Color: the magenta primary should accent, not dominate. Check nothing outside the CTA buttons and small accents is over-saturated.

- [ ] **Step 2: Check mobile width**

Resize to a mobile viewport and re-check the same page. Specifically confirm the hero's two-column layout collapses to a single readable column, the invoice mockup doesn't overflow or look cramped, and the pricing/FAQ grids collapse to one column cleanly.

- [ ] **Step 3: Check dark-mode-adjacent concerns**

This app doesn't have a dark mode, so skip that — but do check the radial gradient behind the invoice mockup and the primary-bordered annual pricing card render correctly (no clipped corners, no z-index issues with the mockup's shadow).

- [ ] **Step 4: Fix what's found**

Apply any spacing, hierarchy, or copy-tightening fixes directly to `client/src/pages/Landing.tsx` (and `InvoicePreview.tsx` if the mockup itself needs adjustment). Re-screenshot after each meaningful change rather than guessing. Keep the constraints from the design spec in force throughout: no em dashes, no fabricated stats, no RRA/EBM compliance claims.

- [ ] **Step 5: Re-run the test suite after any code changes**

Run: `cd client && npm test && npm run typecheck`
Expected: still all passing after any Step 4 edits.

- [ ] **Step 6: Commit any fixes**

```bash
git add client/src/pages/Landing.tsx client/src/components/landing/InvoicePreview.tsx
git commit -m "polish landing page spacing, hierarchy, and visual balance"
```

Skip this step if Step 4 found nothing to change.

---

## Self-review notes

- **Spec coverage:** the routing change for logged-in vs. logged-out visitors (Task 1), every section from the design doc — header, hero, problem framing, document types, how-it-works, pricing, FAQ, final CTA, footer (Task 2) — the voice constraints (no em dashes, no fabricated social proof, no RRA/EBM compliance overclaim, verified by an explicit test) and the real-design-system reuse (Fraunces/Plus Jakarta Sans/existing color tokens, no new ones introduced) are all covered. The visual-quality bar ("looks like a $10,000 product") gets its own task (Task 3) since no automated test can verify it.
- **Placeholder scan:** no TBD/TODO; every step shows real code or an exact command, except Task 3's verification checklist, which is inherently a manual design-review pass.
- **Type consistency:** `Landing`'s default export signature matches what `RootRoute.tsx` imports in both tasks (Task 1's placeholder and Task 2's real version). `PLAN_PRICES`/`formatRwf` are reused from `@billa/shared` exactly as already used elsewhere in the codebase (`BillingSection.tsx`, `Documents.tsx`), not redefined.
- **Scope check:** three tasks, two small new files and one page rewrite — appropriately sized for a single-page deliverable, with the design-polish pass deliberately separated so copy/structure and visual refinement aren't conflated into one unreviewable step.
