# Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder Dashboard page with a working landing page: quick document-creation shortcuts, actionable counts (drafts, overdue invoices), a recent-documents list, and a first-time empty state. No money totals anywhere.

**Architecture:** One new server endpoint, `GET /dashboard/summary`, computing draft count, overdue-invoice count, and the 6 most recent documents with three parallel Prisma queries scoped to the authenticated business. `Dashboard.tsx` is rewritten to fetch it and render the four sections from the design doc.

**Tech Stack:** Express, Prisma, React, Vitest, React Testing Library — matching every other route/page in this codebase.

---

### Task 1: `GET /dashboard/summary` endpoint

**Files:**
- Create: `server/src/routes/dashboard.ts`
- Create: `server/src/routes/dashboard.summary.test.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/routes/dashboard.summary.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[]) {
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Musanze Supplies" });
  return res.body.customer.id as string;
}

async function createDocument(
  app: ReturnType<typeof createApp>,
  cookies: string[],
  customerId: string,
  type = "INVOICE",
  dueDate?: string,
) {
  const res = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type,
      customerId,
      issueDate: "2026-08-19",
      ...(dueDate ? { dueDate } : {}),
      lines: [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }],
    });
  return res.body.document.id as string;
}

async function finalizeDocument(app: ReturnType<typeof createApp>, cookies: string[], id: string) {
  await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
}

describe("GET /dashboard/summary", () => {
  it("counts drafts and excludes finalized documents", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId);
    const toFinalize = await createDocument(app, cookies, customerId);
    await finalizeDocument(app, cookies, toFinalize);

    const res = await request(app).get("/dashboard/summary").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.draftCount).toBe(1);
  });

  it("counts finalized invoices past their due date as overdue, and excludes drafts and future due dates", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const overdueId = await createDocument(app, cookies, customerId, "INVOICE", "2020-01-01");
    await finalizeDocument(app, cookies, overdueId);

    const notYetDueId = await createDocument(app, cookies, customerId, "INVOICE", "2099-01-01");
    await finalizeDocument(app, cookies, notYetDueId);

    await createDocument(app, cookies, customerId, "INVOICE", "2020-01-01");

    const res = await request(app).get("/dashboard/summary").set("Cookie", cookies);

    expect(res.body.overdueInvoiceCount).toBe(1);
  });

  it("does not count a past-due quote as an overdue invoice", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const quoteId = await createDocument(app, cookies, customerId, "QUOTE", "2020-01-01");
    await finalizeDocument(app, cookies, quoteId);

    const res = await request(app).get("/dashboard/summary").set("Cookie", cookies);

    expect(res.body.overdueInvoiceCount).toBe(0);
  });

  it("returns the 6 most recently created documents, newest first", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      ids.push(await createDocument(app, cookies, customerId));
    }

    const res = await request(app).get("/dashboard/summary").set("Cookie", cookies);

    expect(res.body.recentDocuments).toHaveLength(6);
    expect(res.body.recentDocuments[0].id).toBe(ids[7]);
    expect(res.body.recentDocuments[0].customerName).toBe("Musanze Supplies");
  });

  it("does not include another business's documents", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId);

    const otherRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).get("/dashboard/summary").set("Cookie", otherCookies);

    expect(res.body.draftCount).toBe(0);
    expect(res.body.recentDocuments).toHaveLength(0);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/dashboard/summary");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/routes/dashboard.summary.test.ts`
Expected: FAIL — `/dashboard/summary` doesn't exist yet (404s).

- [ ] **Step 3: Write the route**

Create `server/src/routes/dashboard.ts`:

```ts
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get("/summary", async (req, res) => {
  const businessId = req.auth!.businessId;

  const [draftCount, overdueInvoiceCount, recentDocuments] = await Promise.all([
    prisma.document.count({ where: { businessId, status: "DRAFT" } }),
    prisma.document.count({
      where: { businessId, type: "INVOICE", status: "FINALIZED", dueDate: { lt: new Date() } },
    }),
    prisma.document.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { customer: { select: { name: true } } },
    }),
  ]);

  res.json({
    draftCount,
    overdueInvoiceCount,
    recentDocuments: recentDocuments.map((doc) => ({
      id: doc.id,
      type: doc.type,
      number: doc.number,
      status: doc.status,
      customerName: doc.customer.name,
      issueDate: doc.issueDate,
    })),
  });
});
```

- [ ] **Step 4: Mount the router**

In `server/src/app.ts`, add the import alongside the other route imports:

```ts
import { dashboardRouter } from "./routes/dashboard.js";
```

And mount it alongside the other routers:

```ts
  app.use("/dashboard", dashboardRouter);
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `cd server && npx vitest run src/routes/dashboard.summary.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 6: Run the full server suite and typecheck**

Run: `cd server && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/dashboard.ts server/src/routes/dashboard.summary.test.ts server/src/app.ts
git commit -m "add GET /dashboard/summary with draft, overdue, and recent-document counts"
```

---

### Task 2: Dashboard page

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`
- Modify: `client/src/pages/Dashboard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `client/src/pages/Dashboard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Dashboard from "./Dashboard";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function mockFetch(summary: unknown, summaryStatus = 200) {
  vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = urlOf(input);
    if (url.includes("/dashboard/summary")) {
      return new Response(JSON.stringify(summary), { status: summaryStatus });
    }
    if (url.includes("/auth/me")) {
      return new Response(
        JSON.stringify({
          user: { id: "u1", email: "owner@example.com" },
          business: { id: "b1", name: "Kigali Traders" },
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 401 });
  });
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Dashboard />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Dashboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a welcome message with the business name", async () => {
    mockFetch({ draftCount: 0, overdueInvoiceCount: 0, recentDocuments: [] });

    renderDashboard();

    expect(await screen.findByText(/welcome, kigali traders/i)).toBeInTheDocument();
  });

  it("shows a quick action link for every document type", async () => {
    mockFetch({ draftCount: 0, overdueInvoiceCount: 0, recentDocuments: [] });

    renderDashboard();
    await screen.findByText(/welcome/i);

    expect(screen.getByRole("link", { name: "New invoice" })).toHaveAttribute("href", "/documents/new?type=INVOICE");
    expect(screen.getByRole("link", { name: "New quote" })).toHaveAttribute("href", "/documents/new?type=QUOTE");
  });

  it("shows attention cards when there are drafts and overdue invoices", async () => {
    mockFetch({
      draftCount: 2,
      overdueInvoiceCount: 1,
      recentDocuments: [
        { id: "d1", type: "INVOICE", number: "INV-0001", status: "FINALIZED", customerName: "Musanze Supplies", issueDate: "2026-08-19" },
      ],
    });

    renderDashboard();

    expect(await screen.findByText(/2 drafts waiting to be finalized/i)).toBeInTheDocument();
    expect(screen.getByText(/1 invoice past due date/i)).toBeInTheDocument();
  });

  it("hides attention cards when there is nothing to flag", async () => {
    mockFetch({
      draftCount: 0,
      overdueInvoiceCount: 0,
      recentDocuments: [
        { id: "d1", type: "INVOICE", number: "INV-0001", status: "FINALIZED", customerName: "Musanze Supplies", issueDate: "2026-08-19" },
      ],
    });

    renderDashboard();
    await screen.findByText("Musanze Supplies");

    expect(screen.queryByText(/waiting to be finalized/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/past due date/i)).not.toBeInTheDocument();
  });

  it("shows recent documents linking to the finalized view or the draft editor", async () => {
    mockFetch({
      draftCount: 1,
      overdueInvoiceCount: 0,
      recentDocuments: [
        { id: "d1", type: "INVOICE", number: "INV-0001", status: "FINALIZED", customerName: "Musanze Supplies", issueDate: "2026-08-19" },
        { id: "d2", type: "QUOTE", number: null, status: "DRAFT", customerName: "Huye Traders", issueDate: "2026-08-18" },
      ],
    });

    renderDashboard();

    expect(await screen.findByText("Musanze Supplies")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /INV-0001/i })).toHaveAttribute("href", "/documents/d1");
    expect(screen.getByRole("link", { name: /Huye Traders/i })).toHaveAttribute("href", "/documents/d2/edit");
  });

  it("shows the empty state when the business has no documents yet", async () => {
    mockFetch({ draftCount: 0, overdueInvoiceCount: 0, recentDocuments: [] });

    renderDashboard();

    expect(await screen.findByText(/haven't created any documents yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create your first invoice/i })).toHaveAttribute(
      "href",
      "/documents/new?type=INVOICE",
    );
  });

  it("shows an error message when the dashboard fails to load", async () => {
    mockFetch({ error: "server_error" }, 500);

    renderDashboard();

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load your dashboard/i);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/Dashboard.test.tsx`
Expected: FAIL — the current Dashboard has no quick actions, attention cards, recent list, or empty state.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `client/src/pages/Dashboard.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DOCUMENT_TYPES, type DocumentStatus, type DocumentType } from "@billa/shared";
import { AppLayout } from "../components/AppLayout";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/apiClient";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";

interface RecentDocument {
  id: string;
  type: DocumentType;
  number: string | null;
  status: DocumentStatus;
  customerName: string;
  issueDate: string;
}

interface DashboardSummary {
  draftCount: number;
  overdueInvoiceCount: number;
  recentDocuments: RecentDocument[];
}

export default function Dashboard() {
  const { business } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    apiRequest<DashboardSummary>("/dashboard/summary")
      .then(setSummary)
      .catch(() => setLoadError(true));
  }, []);

  const hasNoDocuments = summary !== null && summary.recentDocuments.length === 0;
  const hasAttentionItems = summary !== null && (summary.draftCount > 0 || summary.overdueInvoiceCount > 0);

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <h1 className="font-display text-3xl font-semibold text-neutral-900">
          Welcome, {business?.name ?? "there"}.
        </h1>

        <div className="flex flex-wrap gap-3">
          {DOCUMENT_TYPES.map((type) => (
            <Link
              key={type}
              to={`/documents/new?type=${type}`}
              className="rounded-lg border border-neutral-200 px-4 py-2.5 font-sans text-sm font-medium text-neutral-700 transition-colors hover:border-primary-500 hover:text-primary-700"
            >
              New {DOCUMENT_TYPE_LABELS[type].singular}
            </Link>
          ))}
        </div>

        {loadError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            Couldn't load your dashboard. Try again.
          </div>
        )}

        {!summary && !loadError && <p className="font-sans text-sm text-neutral-600">Loading…</p>}

        {summary && hasNoDocuments && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
            <p className="font-sans text-sm text-neutral-600">You haven't created any documents yet.</p>
            <Link
              to="/documents/new?type=INVOICE"
              className="flex w-auto items-center justify-center rounded-lg bg-primary-500 px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
            >
              Create your first invoice
            </Link>
          </div>
        )}

        {summary && !hasNoDocuments && hasAttentionItems && (
          <div className="flex flex-wrap gap-3">
            {summary.draftCount > 0 && (
              <Link
                to="/documents"
                className="rounded-lg border border-neutral-200 px-4 py-3 font-sans text-sm text-neutral-700 hover:bg-neutral-50"
              >
                {summary.draftCount} draft{summary.draftCount === 1 ? "" : "s"} waiting to be finalized
              </Link>
            )}
            {summary.overdueInvoiceCount > 0 && (
              <Link
                to="/documents"
                className="rounded-lg border border-neutral-200 px-4 py-3 font-sans text-sm text-neutral-700 hover:bg-neutral-50"
              >
                {summary.overdueInvoiceCount} invoice{summary.overdueInvoiceCount === 1 ? "" : "s"} past due date
              </Link>
            )}
          </div>
        )}

        {summary && !hasNoDocuments && (
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-lg font-semibold text-neutral-900">Recent documents</h2>
            <div className="flex flex-col gap-1">
              {summary.recentDocuments.map((doc) => (
                <Link
                  key={doc.id}
                  to={doc.status === "DRAFT" ? `/documents/${doc.id}/edit` : `/documents/${doc.id}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-neutral-100 px-4 py-3 font-sans text-sm hover:bg-neutral-50"
                >
                  <span className="text-neutral-600">{DOCUMENT_TYPE_LABELS[doc.type].singular}</span>
                  <span>{doc.number ?? "Draft"}</span>
                  <span className="text-neutral-600">{doc.customerName}</span>
                  <span className="text-neutral-600">{doc.status}</span>
                  <span className="text-neutral-600">{doc.issueDate.slice(0, 10)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd client && npx vitest run src/pages/Dashboard.test.tsx`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Dashboard.tsx client/src/pages/Dashboard.test.tsx
git commit -m "build the dashboard: quick actions, attention items, recent documents, empty state"
```

---

### Task 3: Full workspace verification

**Files:** none (verification only)

- [ ] **Step 1: Run every workspace's test suite**

Run: `cd shared && npm test && cd ../server && npm test && cd ../client && npm test`
Expected: all pass.

- [ ] **Step 2: Typecheck every workspace**

Run: `cd shared && npm run typecheck && cd ../server && npm run typecheck && cd ../client && npm run typecheck`
Expected: no errors in any workspace.

- [ ] **Step 3: Real-browser verification**

With both dev servers running:

1. Log in to a business with zero documents. Confirm the empty state shows ("You haven't created any documents yet." + "Create your first invoice"), quick actions are all present, and no attention cards or recent-documents heading show.
2. Click a quick action (e.g. "New quote"). Confirm it opens the document form pre-set to that type.
3. Create and finalize an invoice with a due date in the past. Reload the dashboard. Confirm "1 invoice past due date" appears and links to the documents list.
4. Create a draft document without finalizing it. Reload. Confirm "1 draft waiting to be finalized" appears.
5. Confirm the recent-documents list shows both, that clicking the finalized one opens the document view, and clicking the draft opens the document editor.
6. Check the browser console and network tab for unexpected errors during all of the above.

- [ ] **Step 4: Fix any issues found**

If real-browser verification finds bugs, fix them, add or update the relevant test(s), re-run that test file to confirm it passes, then commit the fix as its own commit.

- [ ] **Step 5: Final confirmation**

Once every workspace's suite passes, every workspace typechecks, and manual verification found no outstanding issues, this stage is done.

---

## Self-review notes

- **Spec coverage:** quick actions (Task 2), attention items for drafts and overdue invoices (Tasks 1 and 2), recent documents with correct draft/finalized routing (Tasks 1 and 2), the first-time empty state (Task 2), the error banner (Task 2), and the dedicated `/dashboard/summary` endpoint instead of overloading the documents list (Task 1) are all covered.
- **Placeholder scan:** no TBD/TODO; every step shows real code or an exact command, except Task 3 Step 3's real-browser verification, which is inherently manual and given as an explicit numbered checklist.
- **Type consistency:** the `DashboardSummary`/`RecentDocument` shape returned by Task 1's route (`draftCount`, `overdueInvoiceCount`, `recentDocuments: { id, type, number, status, customerName, issueDate }[]`) matches exactly what Task 2's `Dashboard.tsx` destructures. `DOCUMENT_TYPE_LABELS` and `DOCUMENT_TYPES` are reused as-is from the existing `documentTypeLabels.ts` and `@billa/shared`, not redefined.
- **Scope check:** two files' worth of new behavior (one route, one page) plus their tests — small enough for a single implementation session, consistent with how Billing's UI tasks were scoped.
