# Sidebar Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `AppLayout`'s overflowing horizontal top bar with a left sidebar that scales cleanly at any viewport width, collapsing into a hamburger-triggered drawer on narrow screens.

**Architecture:** A new `Sidebar` component holds all nav content (logo, business switcher, links, billing banner, logout) and is rendered twice by `AppLayout` — once as a permanent desktop `<aside>`, once inside a dismissible mobile overlay — so there's exactly one source of truth for what the navigation contains.

**Tech Stack:** React, React Router (`useLocation` for active-link state), Vitest, React Testing Library.

---

### Task 1: Sidebar component

**Files:**
- Create: `client/src/components/Sidebar.tsx`
- Create: `client/src/components/Sidebar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `client/src/components/Sidebar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { Sidebar } from "./Sidebar";

function mockFetch() {
  vi.spyOn(global, "fetch").mockImplementation(async () => new Response("{}", { status: 401 }));
}

function renderSidebar(onNavigate?: () => void) {
  mockFetch();
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Sidebar billingBanner={null} onNavigate={onNavigate} />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows every nav link", async () => {
    renderSidebar();

    expect(await screen.findByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All documents" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^invoices$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /proforma invoices/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /delivery notes/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^quotes$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /receipts/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Customers" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Items" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("calls onNavigate when a link is clicked", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderSidebar(onNavigate);

    await user.click(await screen.findByRole("link", { name: "Customers" }));

    expect(onNavigate).toHaveBeenCalled();
  });

  it("shows the billing banner when provided", async () => {
    mockFetch();
    render(
      <MemoryRouter>
        <AuthProvider>
          <Sidebar billingBanner="Your trial ends in 2 days." />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Your trial ends in 2 days.")).toBeInTheDocument();
  });

  it("calls the logout endpoint when 'Log out' is clicked", async () => {
    const user = userEvent.setup();
    renderSidebar();
    await screen.findByRole("link", { name: "Dashboard" });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await user.click(screen.getByRole("button", { name: /log out/i }));

    expect(fetchSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/components/Sidebar.test.tsx`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Write the component**

Create `client/src/components/Sidebar.tsx`:

```tsx
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { DOCUMENT_TYPES } from "@billa/shared";
import { useAuth } from "../context/AuthContext";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";
import { BusinessSwitcher } from "./BusinessSwitcher";

interface SidebarProps {
  billingBanner: string | null;
  onNavigate?: () => void;
}

function isLinkActive(pathname: string, search: string, to: string): boolean {
  const [toPath, toQuery] = to.split("?");
  if (pathname !== toPath) return false;
  if (!toQuery) return !search;
  const toType = new URLSearchParams(toQuery).get("type");
  const currentType = new URLSearchParams(search).get("type");
  return toType === currentType;
}

function SidebarLink({
  to,
  children,
  isActive,
  onNavigate,
}: {
  to: string;
  children: ReactNode;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`block rounded-lg px-3 py-2 font-sans text-sm font-medium transition-colors ${
        isActive ? "bg-primary-100 text-primary-700" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
      }`}
    >
      {children}
    </Link>
  );
}

export function Sidebar({ billingBanner, onNavigate }: SidebarProps) {
  const { logout } = useAuth();
  const { pathname, search } = useLocation();
  const active = (to: string) => isLinkActive(pathname, search, to);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500">
          <img src="/logo.png" alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
        </span>
        <BusinessSwitcher />
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        <SidebarLink to="/dashboard" isActive={pathname === "/dashboard"} onNavigate={onNavigate}>
          Dashboard
        </SidebarLink>

        <p className="mt-4 px-3 font-sans text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Documents
        </p>
        <SidebarLink to="/documents" isActive={active("/documents")} onNavigate={onNavigate}>
          All documents
        </SidebarLink>
        {DOCUMENT_TYPES.map((type) => (
          <SidebarLink
            key={type}
            to={`/documents?type=${type}`}
            isActive={active(`/documents?type=${type}`)}
            onNavigate={onNavigate}
          >
            {DOCUMENT_TYPE_LABELS[type].plural}
          </SidebarLink>
        ))}

        <div className="mt-4 flex flex-col gap-1">
          <SidebarLink to="/customers" isActive={pathname === "/customers"} onNavigate={onNavigate}>
            Customers
          </SidebarLink>
          <SidebarLink to="/items" isActive={pathname === "/items"} onNavigate={onNavigate}>
            Items
          </SidebarLink>
        </div>

        <div className="mt-4 border-t border-neutral-100 pt-4">
          <SidebarLink to="/settings" isActive={pathname === "/settings"} onNavigate={onNavigate}>
            Settings
          </SidebarLink>
        </div>
      </nav>

      <div className="flex flex-col gap-3 border-t border-neutral-100 px-4 py-4">
        {billingBanner && (
          <p className="rounded-lg bg-warning-bg px-3 py-2 font-sans text-xs text-warning" role="status">
            {billingBanner}
          </p>
        )}
        <button
          type="button"
          onClick={() => logout()}
          className="text-left font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `cd client && npx vitest run src/components/Sidebar.test.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Sidebar.tsx client/src/components/Sidebar.test.tsx
git commit -m "add a Sidebar component for the app's navigation"
```

---

### Task 2: Responsive AppLayout shell

**Files:**
- Modify: `client/src/components/AppLayout.tsx`
- Modify: `client/src/components/AppLayout.test.tsx`

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe("AppLayout", ...)` block in `client/src/components/AppLayout.test.tsx`, right before the closing `});`:

```tsx
  it("opens and closes the mobile navigation drawer", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderAppLayout();
    await screen.findByRole("link", { name: /customers/i });

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    const customersLinks = screen.getAllByRole("link", { name: /customers/i });
    expect(customersLinks.length).toBeGreaterThan(1);

    await user.click(customersLinks[customersLinks.length - 1]);
    expect(screen.getAllByRole("link", { name: /customers/i })).toHaveLength(1);
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/components/AppLayout.test.tsx`
Expected: FAIL — there's no "Open menu" button yet.

- [ ] **Step 3: Rewrite AppLayout**

Replace the full contents of `client/src/components/AppLayout.tsx`:

```tsx
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { apiRequest } from "../lib/apiClient";
import { Sidebar } from "./Sidebar";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [billingBanner, setBillingBanner] = useState<string | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    apiRequest<{ activeUntil: string }>("/billing/status")
      .then((data) => {
        const daysLeft = Math.ceil((new Date(data.activeUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 0) {
          setBillingBanner("Your trial has ended. Subscribe in Settings to keep creating documents.");
        } else if (daysLeft <= 3) {
          setBillingBanner(
            `Your trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Subscribe in Settings to avoid interruption.`,
          );
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="hidden w-64 shrink-0 border-r border-neutral-200 bg-white lg:block">
        <Sidebar billingBanner={billingBanner} />
      </aside>

      {isMobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-neutral-900/40" onClick={() => setIsMobileNavOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-neutral-200 bg-white">
            <Sidebar billingBanner={billingBanner} onNavigate={() => setIsMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setIsMobileNavOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-display text-base font-semibold text-neutral-900">Billa</span>
        </header>
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `cd client && npx vitest run src/components/AppLayout.test.tsx`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/AppLayout.tsx client/src/components/AppLayout.test.tsx
git commit -m "replace the overflowing top bar with a responsive sidebar"
```

---

### Task 3: Real-browser verification

**Files:** none (verification only)

- [ ] **Step 1: Desktop check**

At a wide viewport (1280px+), confirm: the sidebar renders full-height on the left, all links are reachable without any wrapping or horizontal scroll, the active link is visually highlighted as you navigate between pages, the business switcher still works from inside the sidebar, and the billing banner (if the test account's trial is close to expiring) appears above the logout button.

- [ ] **Step 2: Narrow viewport check**

Resize below 1024px (the `lg` breakpoint). Confirm: the sidebar disappears, a slim header with a hamburger button appears instead, tapping it slides in the same navigation as an overlay with a dismissible backdrop, and there is no horizontal scrollbar at any width down to a typical phone width (375px).

- [ ] **Step 3: Fix any issues found**

If real-browser verification finds bugs, fix them, add or update the relevant test(s), re-run that test file to confirm it passes, then commit the fix as its own commit.

- [ ] **Step 4: Final confirmation**

Once desktop and narrow-viewport behavior both check out and the full client suite still passes, this stage is done.

---

## Self-review notes

- **Spec coverage:** the sidebar structure (logo, switcher, Dashboard, grouped Documents section, Customers/Items, Settings, billing banner, logout — Task 1), the responsive desktop/mobile shell with a dismissible drawer (Task 2), and confirmation that no page other than `AppLayout` needed to change (nothing in Task 1 or 2 touches any other file) are all covered.
- **Placeholder scan:** no TBD/TODO; every step shows real code or an exact command, except Task 3's browser checklist, which is inherently manual.
- **Type consistency:** `SidebarProps` (`billingBanner`, `onNavigate`) match exactly how `AppLayout` calls `<Sidebar />` in both its desktop and mobile-drawer renders.
