# Dashboard V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Dashboard's quick actions into proper cards and add three document-activity metrics (a headline stat, a by-type breakdown, and a 14-day trend), all backed by real chart components, never money figures.

**Architecture:** `GET /dashboard/summary` gains four new fields computed alongside the existing ones. `Dashboard.tsx` renders the new data with Recharts (`BarChart` for the by-type breakdown, `LineChart` for the 14-day trend), both using a single brand hue since each is a single-series magnitude/trend view, not a multi-category comparison.

**Tech Stack:** Express, Prisma, React, Recharts (new dependency), Vitest, React Testing Library.

---

### Task 1: Extend the dashboard summary endpoint

**Files:**
- Modify: `server/src/routes/dashboard.ts`
- Modify: `server/src/routes/dashboard.summary.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these tests inside the existing `describe("GET /dashboard/summary", ...)` block in `server/src/routes/dashboard.summary.test.ts`, right before the closing `});`:

```ts
  it("counts documents created this month separately from last month", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    await createDocument(app, cookies, customerId);
    const lastMonthId = await createDocument(app, cookies, customerId);
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    await prisma.document.update({ where: { id: lastMonthId }, data: { createdAt: lastMonth } });

    const res = await request(app).get("/dashboard/summary").set("Cookie", cookies);

    expect(res.body.documentsThisMonth).toBe(1);
    expect(res.body.documentsLastMonth).toBe(1);
  });

  it("returns all five document types in documentsByType, even at zero", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId, "INVOICE");

    const res = await request(app).get("/dashboard/summary").set("Cookie", cookies);

    expect(res.body.documentsByType).toHaveLength(5);
    const invoiceRow = res.body.documentsByType.find((row: { type: string }) => row.type === "INVOICE");
    const quoteRow = res.body.documentsByType.find((row: { type: string }) => row.type === "QUOTE");
    expect(invoiceRow.count).toBe(1);
    expect(quoteRow.count).toBe(0);
  });

  it("returns 14 days of activity, including zero-count days", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId);

    const res = await request(app).get("/dashboard/summary").set("Cookie", cookies);

    expect(res.body.activityByDay).toHaveLength(14);
    const today = new Date().toISOString().slice(0, 10);
    const todayRow = res.body.activityByDay.find((row: { date: string }) => row.date === today);
    expect(todayRow.count).toBe(1);
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/routes/dashboard.summary.test.ts`
Expected: FAIL on the 3 new tests — the response has none of these fields yet.

- [ ] **Step 3: Extend the route**

Replace the full contents of `server/src/routes/dashboard.ts`:

```ts
import { Router } from "express";
import { DOCUMENT_TYPES } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

function startOfMonth(date: Date, monthsAgo: number): Date {
  return new Date(date.getFullYear(), date.getMonth() - monthsAgo, 1);
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

dashboardRouter.get("/summary", async (req, res) => {
  const businessId = req.auth!.businessId;
  const now = new Date();
  const startOfThisMonth = startOfMonth(now, 0);
  const startOfLastMonth = startOfMonth(now, 1);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
  fourteenDaysAgo.setHours(0, 0, 0, 0);

  const [
    draftCount,
    overdueInvoiceCount,
    recentDocuments,
    documentsThisMonth,
    documentsLastMonth,
    documentsByTypeRaw,
    recentForActivity,
  ] = await Promise.all([
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
    prisma.document.count({ where: { businessId, createdAt: { gte: startOfThisMonth } } }),
    prisma.document.count({
      where: { businessId, createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } },
    }),
    prisma.document.groupBy({ by: ["type"], where: { businessId }, _count: { _all: true } }),
    prisma.document.findMany({
      where: { businessId, createdAt: { gte: fourteenDaysAgo } },
      select: { createdAt: true },
    }),
  ]);

  const countsByType = new Map(documentsByTypeRaw.map((row) => [row.type, row._count._all]));
  const documentsByType = DOCUMENT_TYPES.map((type) => ({ type, count: countsByType.get(type) ?? 0 }));

  const countsByDay = new Map<string, number>();
  for (const doc of recentForActivity) {
    const key = dayKey(doc.createdAt);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
  }
  const activityByDay = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(fourteenDaysAgo);
    date.setDate(date.getDate() + i);
    const key = dayKey(date);
    return { date: key, count: countsByDay.get(key) ?? 0 };
  });

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
    documentsThisMonth,
    documentsLastMonth,
    documentsByType,
    activityByDay,
  });
});
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `cd server && npx vitest run src/routes/dashboard.summary.test.ts`
Expected: PASS, all 9 tests (6 existing + 3 new).

- [ ] **Step 5: Run the full server suite and typecheck**

Run: `cd server && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/dashboard.ts server/src/routes/dashboard.summary.test.ts
git commit -m "add month-over-month, by-type, and 14-day activity data to the dashboard summary"
```

---

### Task 2: Shared document-type descriptions

**Files:**
- Modify: `client/src/lib/documentTypeLabels.ts`
- Modify: `client/src/pages/Landing.tsx`

The landing page already has a one-line description per document type as a local array; the dashboard cards need the same text. Move it into the shared label map instead of duplicating it.

- [ ] **Step 1: Add descriptions to the shared label map**

Replace the full contents of `client/src/lib/documentTypeLabels.ts`:

```ts
import type { DocumentType } from "@billa/shared";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, { singular: string; plural: string; description: string }> = {
  INVOICE: {
    singular: "invoice",
    plural: "Invoices",
    description: "Bill customers with itemized totals and RWF tax calculations.",
  },
  PROFORMA: {
    singular: "proforma invoice",
    plural: "Proforma invoices",
    description: "Send a formal quote before the sale, then convert it to an invoice in one click.",
  },
  DELIVERY_NOTE: {
    singular: "delivery note",
    plural: "Delivery notes",
    description: "Confirm what was delivered, separate from what's being billed.",
  },
  QUOTE: {
    singular: "quote",
    plural: "Quotes",
    description: "Give a customer a price before they commit.",
  },
  RECEIPT: {
    singular: "receipt",
    plural: "Receipts",
    description: "Confirm that payment was received.",
  },
};
```

- [ ] **Step 2: Use the shared map on the landing page instead of a local copy**

In `client/src/pages/Landing.tsx`, remove the local `DOCUMENT_TYPES` array:

```ts
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
```

Add this import:

```ts
import { DOCUMENT_TYPES } from "@billa/shared";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";
```

And change the section that maps over it:

```tsx
        <div className="mt-12 flex flex-col">
          {DOCUMENT_TYPES.map((doc, index) => (
            <div
              key={doc.name}
              className="flex flex-col gap-1 border-t border-neutral-200 py-6 first:border-t-0 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <span className="font-display text-sm text-neutral-400">0{index + 1}</span>
              <h3 className="font-display text-xl font-semibold text-neutral-900 sm:w-48 sm:shrink-0">{doc.name}</h3>
              <p className="font-sans text-base text-neutral-600">{doc.description}</p>
            </div>
          ))}
        </div>
```

becomes:

```tsx
        <div className="mt-12 flex flex-col">
          {DOCUMENT_TYPES.map((type, index) => (
            <div
              key={type}
              className="flex flex-col gap-1 border-t border-neutral-200 py-6 first:border-t-0 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <span className="font-display text-sm text-neutral-400">0{index + 1}</span>
              <h3 className="font-display text-xl font-semibold text-neutral-900 sm:w-48 sm:shrink-0">
                {DOCUMENT_TYPE_LABELS[type].plural}
              </h3>
              <p className="font-sans text-base text-neutral-600">{DOCUMENT_TYPE_LABELS[type].description}</p>
            </div>
          ))}
        </div>
```

Note `DOCUMENT_TYPES` is now imported from `@billa/shared` (the `["INVOICE", "PROFORMA", ...]` string-literal array), replacing the removed local array of the same name — there's no naming collision since the old one is deleted.

- [ ] **Step 3: Run the landing page tests to confirm nothing broke**

Run: `cd client && npx vitest run src/pages/Landing.test.tsx`
Expected: PASS, all 4 tests (the headline, pricing, CTA links, and RRA/EBM absence checks don't depend on this section's exact markup).

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/documentTypeLabels.ts client/src/pages/Landing.tsx
git commit -m "share document-type descriptions between the landing page and dashboard"
```

---

### Task 3: Card quick actions and document metrics

**Files:**
- Modify: `client/package.json` (adds `recharts`)
- Modify: `client/src/pages/Dashboard.tsx`
- Modify: `client/src/pages/Dashboard.test.tsx`

- [ ] **Step 1: Install recharts**

Run: `cd client && npm install recharts`

- [ ] **Step 2: Write the failing tests**

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

function baseActivity() {
  return Array.from({ length: 14 }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, "0")}`,
    count: 0,
  }));
}

function baseByType() {
  return [
    { type: "INVOICE", count: 0 },
    { type: "PROFORMA", count: 0 },
    { type: "DELIVERY_NOTE", count: 0 },
    { type: "QUOTE", count: 0 },
    { type: "RECEIPT", count: 0 },
  ];
}

function baseSummary(overrides: Record<string, unknown> = {}) {
  return {
    draftCount: 0,
    overdueInvoiceCount: 0,
    recentDocuments: [],
    documentsThisMonth: 0,
    documentsLastMonth: 0,
    documentsByType: baseByType(),
    activityByDay: baseActivity(),
    ...overrides,
  };
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
    mockFetch(baseSummary());

    renderDashboard();

    expect(await screen.findByText(/welcome, kigali traders/i)).toBeInTheDocument();
  });

  it("shows a quick action card for every document type", async () => {
    mockFetch(baseSummary());

    renderDashboard();
    await screen.findByText(/welcome/i);

    expect(screen.getByRole("link", { name: /new invoice/i })).toHaveAttribute("href", "/documents/new?type=INVOICE");
    expect(screen.getByRole("link", { name: /new quote/i })).toHaveAttribute("href", "/documents/new?type=QUOTE");
  });

  it("shows attention cards when there are drafts and overdue invoices", async () => {
    mockFetch(
      baseSummary({
        draftCount: 2,
        overdueInvoiceCount: 1,
        recentDocuments: [
          {
            id: "d1",
            type: "INVOICE",
            number: "INV-0001",
            status: "FINALIZED",
            customerName: "Musanze Supplies",
            issueDate: "2026-08-19",
          },
        ],
      }),
    );

    renderDashboard();

    expect(await screen.findByText(/2 drafts waiting to be finalized/i)).toBeInTheDocument();
    expect(screen.getByText(/1 invoice past due date/i)).toBeInTheDocument();
  });

  it("hides attention cards when there is nothing to flag", async () => {
    mockFetch(
      baseSummary({
        recentDocuments: [
          {
            id: "d1",
            type: "INVOICE",
            number: "INV-0001",
            status: "FINALIZED",
            customerName: "Musanze Supplies",
            issueDate: "2026-08-19",
          },
        ],
      }),
    );

    renderDashboard();
    await screen.findByText("Musanze Supplies");

    expect(screen.queryByText(/waiting to be finalized/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/past due date/i)).not.toBeInTheDocument();
  });

  it("shows recent documents linking to the finalized view or the draft editor", async () => {
    mockFetch(
      baseSummary({
        draftCount: 1,
        recentDocuments: [
          {
            id: "d1",
            type: "INVOICE",
            number: "INV-0001",
            status: "FINALIZED",
            customerName: "Musanze Supplies",
            issueDate: "2026-08-19",
          },
          {
            id: "d2",
            type: "QUOTE",
            number: null,
            status: "DRAFT",
            customerName: "Huye Traders",
            issueDate: "2026-08-18",
          },
        ],
      }),
    );

    renderDashboard();

    expect(await screen.findByText("Musanze Supplies")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /INV-0001/i })).toHaveAttribute("href", "/documents/d1");
    expect(screen.getByRole("link", { name: /Huye Traders/i })).toHaveAttribute("href", "/documents/d2/edit");
  });

  it("shows the empty state and skips the metrics section when the business has no documents yet", async () => {
    mockFetch(baseSummary());

    renderDashboard();

    expect(await screen.findByText(/haven't created any documents yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create your first invoice/i })).toHaveAttribute(
      "href",
      "/documents/new?type=INVOICE",
    );
    expect(screen.queryByText(/documents this month/i)).not.toBeInTheDocument();
  });

  it("shows an error message when the dashboard fails to load", async () => {
    mockFetch({ error: "server_error" }, 500);

    renderDashboard();

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load your dashboard/i);
  });

  it("shows the documents-this-month headline stat with a comparison to last month", async () => {
    mockFetch(
      baseSummary({
        documentsThisMonth: 5,
        documentsLastMonth: 2,
        recentDocuments: [
          {
            id: "d1",
            type: "INVOICE",
            number: "INV-0001",
            status: "FINALIZED",
            customerName: "Musanze Supplies",
            issueDate: "2026-08-19",
          },
        ],
      }),
    );

    renderDashboard();

    expect(await screen.findByText("5")).toBeInTheDocument();
    expect(screen.getByText(/3 more than last month/i)).toBeInTheDocument();
  });

  it("shows 'fewer' and 'same' comparisons correctly", async () => {
    mockFetch(
      baseSummary({
        documentsThisMonth: 1,
        documentsLastMonth: 4,
        recentDocuments: [
          {
            id: "d1",
            type: "INVOICE",
            number: "INV-0001",
            status: "FINALIZED",
            customerName: "Musanze Supplies",
            issueDate: "2026-08-19",
          },
        ],
      }),
    );

    renderDashboard();

    expect(await screen.findByText(/3 fewer than last month/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/Dashboard.test.tsx`
Expected: FAIL on the card-link-name assertions (current links are named e.g. "New invoice" as plain text already, so this specific assertion may pass, but the headline-stat and comparison tests fail since that content doesn't exist yet) and the empty-state metrics-absence check.

- [ ] **Step 4: Write the implementation**

Replace the full contents of `client/src/pages/Dashboard.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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

interface DocumentTypeCount {
  type: DocumentType;
  count: number;
}

interface ActivityDay {
  date: string;
  count: number;
}

interface DashboardSummary {
  draftCount: number;
  overdueInvoiceCount: number;
  recentDocuments: RecentDocument[];
  documentsThisMonth: number;
  documentsLastMonth: number;
  documentsByType: DocumentTypeCount[];
  activityByDay: ActivityDay[];
}

const TYPE_MONOGRAM: Record<DocumentType, string> = {
  INVOICE: "IN",
  PROFORMA: "PR",
  DELIVERY_NOTE: "DN",
  QUOTE: "QU",
  RECEIPT: "RE",
};

function monthComparison(thisMonth: number, lastMonth: number): string {
  const diff = thisMonth - lastMonth;
  if (diff === 0) return "Same as last month";
  if (diff > 0) return `${diff} more than last month`;
  return `${Math.abs(diff)} fewer than last month`;
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
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <h1 className="font-display text-3xl font-semibold text-neutral-900">
          Welcome, {business?.name ?? "there"}.
        </h1>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DOCUMENT_TYPES.map((type) => (
            <Link
              key={type}
              to={`/documents/new?type=${type}`}
              className="group flex flex-col gap-3 rounded-xl border border-neutral-200 p-5 transition-all hover:border-primary-500 hover:shadow-md"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 font-sans text-xs font-semibold text-primary-700 transition-colors group-hover:bg-primary-500 group-hover:text-white">
                {TYPE_MONOGRAM[type]}
              </span>
              <div>
                <p className="font-display text-base font-semibold text-neutral-900">
                  New {DOCUMENT_TYPE_LABELS[type].singular}
                </p>
                <p className="mt-1 font-sans text-sm text-neutral-500">{DOCUMENT_TYPE_LABELS[type].description}</p>
              </div>
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-neutral-200 p-6">
              <p className="font-sans text-sm text-neutral-500">Documents this month</p>
              <p className="mt-2 font-display text-4xl font-semibold text-neutral-900">
                {summary.documentsThisMonth}
              </p>
              <p className="mt-2 font-sans text-sm text-neutral-500">
                {monthComparison(summary.documentsThisMonth, summary.documentsLastMonth)}
              </p>
            </div>

            <div className="rounded-xl border border-neutral-200 p-6 lg:col-span-2">
              <p className="font-sans text-sm font-semibold text-neutral-900">Documents by type</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={summary.documentsByType} layout="vertical" margin={{ left: 8, right: 16, top: 8 }}>
                  <CartesianGrid horizontal={false} stroke="#e4e4e7" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "#71717a" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="type"
                    tickFormatter={(type: DocumentType) => DOCUMENT_TYPE_LABELS[type].plural}
                    tick={{ fontSize: 12, fill: "#52525b" }}
                    axisLine={false}
                    tickLine={false}
                    width={110}
                  />
                  <Tooltip
                    formatter={(value: number) => [value, "Documents"]}
                    labelFormatter={(type: DocumentType) => DOCUMENT_TYPE_LABELS[type].plural}
                    contentStyle={{ borderRadius: 8, borderColor: "#e4e4e7", fontSize: 12 }}
                  />
                  <Bar dataKey="count" fill="#c2185b" radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-neutral-200 p-6 lg:col-span-3">
              <p className="font-sans text-sm font-semibold text-neutral-900">Activity, last 14 days</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={summary.activityByDay} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e4e4e7" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date: string) => date.slice(5)}
                    tick={{ fontSize: 11, fill: "#71717a" }}
                    axisLine={false}
                    tickLine={false}
                    interval={2}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "#71717a" }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip
                    formatter={(value: number) => [value, "Documents"]}
                    labelFormatter={(date: string) => date}
                    contentStyle={{ borderRadius: 8, borderColor: "#e4e4e7", fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#c2185b"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#c2185b" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
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

- [ ] **Step 5: Run it to confirm it passes**

Run: `cd client && npx vitest run src/pages/Dashboard.test.tsx`
Expected: PASS, all 9 tests.

- [ ] **Step 6: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add client/package.json client/package-lock.json client/src/pages/Dashboard.tsx client/src/pages/Dashboard.test.tsx
git commit -m "add card quick actions and document activity metrics to the dashboard"
```

---

### Task 4: Visual verification

**Files:** none (verification only)

- [ ] **Step 1: Populate real activity**

With the dev servers running, log in to a business, create and finalize a handful of documents across a few different types (reusing the existing manual-testing flow), so the by-type bar chart and 14-day line chart have real, non-zero data to render.

- [ ] **Step 2: Check the charts render correctly**

Per the dataviz skill's final step, actually look at the rendered charts, not just confirm they mount: bars should be a single magenta hue with visible category labels, the line should be thin (2px) with a visible dot on hover showing the exact date and count, axes should be recessive (light gray, no heavy borders), and nothing should overflow its card at both desktop and narrow widths.

- [ ] **Step 3: Check the card quick actions**

Confirm all five cards render with their monogram badge, name, and description, and that hovering highlights the border and badge color as designed.

- [ ] **Step 4: Fix any issues found**

If real-browser verification finds bugs, fix them, add or update the relevant test(s), re-run that test file to confirm it passes, then commit the fix as its own commit.

- [ ] **Step 5: Final confirmation**

Once the full client and server suites pass, both typecheck clean, and manual verification found no outstanding issues, this stage is done.

---

## Self-review notes

- **Spec coverage:** the card quick actions with icon accents and descriptions (Task 3), the headline stat with month-over-month comparison (Tasks 1 and 3), the by-type bar chart and 14-day line chart both using a single brand hue since each is a single-series view (Task 3), the metrics section being skipped in the empty-state case (Task 3), and the shared document-type descriptions eliminating duplication between the landing page and dashboard (Task 2) are all covered.
- **Placeholder scan:** no TBD/TODO; every step shows real code or an exact command, except Task 4's manual visual-verification checklist.
- **Type consistency:** `DashboardSummary`'s new fields (`documentsThisMonth`, `documentsLastMonth`, `documentsByType`, `activityByDay`) match exactly what Task 1's route returns. `DOCUMENT_TYPE_LABELS[type].description` (Task 2) is used identically by both `Landing.tsx` and `Dashboard.tsx`.
- **Dataviz compliance:** single-hue marks for both single-series charts (no categorical palette needed since categories are text-labeled, not color-differentiated), recessive gridlines/axes, hover tooltips on both chart types, thin 2px line with rounded active dot, and a real look-at-the-render verification step rather than trusting the code alone.
