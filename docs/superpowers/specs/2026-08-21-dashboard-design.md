# Dashboard Design

**Goal:** Replace the placeholder Dashboard page (currently just a welcome message) with a working landing page that helps a business owner create documents quickly and see what needs attention, without pretending to be a bookkeeping or analytics product.

## Scope

Billa is documents-only: it tracks invoices, proforma invoices, delivery notes, quotes, and receipts, but not whether an invoice has actually been paid. The dashboard must not show anything that could be mistaken for revenue or payment-collection data. Everything on it is a count or a list of documents, never a money total.

## Content

The dashboard has four sections, in order:

### 1. Quick actions

A row of buttons, one per document type (Invoice, Proforma Invoice, Delivery Note, Quote, Receipt), each linking to `/documents/new?type=<TYPE>`. This route and query param already work today (`DocumentForm.tsx` reads `type` from `useSearchParams()`). Labels come from the existing `DOCUMENT_TYPE_LABELS` map so wording stays consistent with the nav.

Always shown, regardless of whether the business has any documents yet.

### 2. Attention items

Two small actionable cards, each shown only when its count is greater than zero:

- **Drafts waiting to be finalized** — count of documents with `status: DRAFT`.
- **Invoices past their due date** — count of documents with `type: INVOICE`, `status: FINALIZED`, and `dueDate` before now.

Wording stays neutral ("past due date," not "unpaid" or "overdue payment") since Billa has no payment-status data. Both cards link to `/documents` (the existing list page, which already supports search/sort) rather than a new filtered view, to avoid adding filter UI that doesn't exist yet.

If both counts are zero, this section doesn't render.

### 3. Recent documents

The 6 most recently created documents across all types, each row showing type, number (or "Draft" if unnumbered), customer name, status, and issue date. Each row links to `/documents/:id`.

If the business has zero documents ever, this section doesn't render (see empty state below).

### 4. First-time empty state

Shown only when the business has zero documents ever, replacing sections 2 and 3: a short message ("You haven't created any documents yet.") and a prominent "Create your first invoice" button linking to `/documents/new?type=INVOICE`.

## Architecture

**New server endpoint:** `GET /dashboard/summary`, mounted in a new `dashboardRouter` (`server/src/routes/dashboard.ts`), behind `requireAuth` (matching every other business-scoped route). Not behind `requireActiveSubscription` — that middleware already allows all GET requests through unconditionally, so it's omitted here the same way it's omitted from `business.ts`.

Response shape:

```ts
interface DashboardSummary {
  draftCount: number;
  overdueInvoiceCount: number;
  recentDocuments: {
    id: string;
    type: DocumentType;
    number: string | null;
    status: DocumentStatus;
    customerName: string;
    total: number;
    issueDate: string;
  }[];
}
```

Computed with three parallel Prisma queries scoped to `req.auth!.businessId`:

```ts
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
```

A dedicated endpoint (rather than reusing `GET /documents` with new filters) keeps the generic document-list query schema free of dashboard-only concerns (a `status` filter and a `dueBefore` filter that no other UI needs), and returns exactly what the dashboard needs in one round trip instead of three.

**Client:** `client/src/pages/Dashboard.tsx` is rewritten (still a single file, matching the existing per-page convention used by `Customers.tsx`/`Items.tsx`) to fetch `/dashboard/summary` on mount and render the four sections above. `business?.name` from `useAuth()` continues to drive the "Welcome, {name}." header text, unchanged from today.

## Error handling

If `/dashboard/summary` fails to load, show the same inline error-banner pattern used elsewhere in the app (`BusinessSettings.tsx`, `BillingSection.tsx`): a `role="alert"` message ("Couldn't load your dashboard. Try again.") in place of sections 2-4, with quick actions (section 1) still shown since it doesn't depend on the fetch.

## Testing

Server: a new `server/src/routes/dashboard.summary.test.ts` covering the count logic (drafts counted, non-drafts excluded; overdue invoices counted only when type is INVOICE, status is FINALIZED, and dueDate has passed; recent documents capped at 6 and ordered newest-first) and the standard auth-required check.

Client: `Dashboard.test.tsx` rewritten to cover: quick actions always render, attention cards render only when counts are non-zero, recent documents render when present, the empty state renders when the business has zero documents, and the error banner renders on a failed fetch.
