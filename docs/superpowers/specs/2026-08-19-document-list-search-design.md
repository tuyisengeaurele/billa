# Billa: Document List & Search (Stage 11)

Date: 2026-08-19

## Scope

Each document type already has its own list page with search (by number or customer name), sortable columns, and pagination, built during the document engine stage. This stage adds two things on top of that: a unified "All documents" view spanning all 5 types, and a date range filter available everywhere a document list appears.

## Server

`documentListQuerySchema` (`shared/src/document-schemas.ts`) changes:

- `type` becomes optional and accepts a comma-separated list of document types (e.g. `type=INVOICE,PROFORMA`), parsed into a `DocumentType[]`. A single value works exactly as it does today, so the 5 existing per-type pages are unaffected. Omitted entirely means no type filter (all 5 types returned).
- Two new optional params, `dateFrom` and `dateTo`, each a date-only string (`YYYY-MM-DD`), filtering on `issueDate`.

`GET /documents` (`server/src/routes/documents.ts`) changes:

- `where.type` is only set when `query.type` is present, using `{ in: query.type }` instead of the current `{ equals: query.type }`. Absent means no type condition at all.
- `where.issueDate` gets `gte: new Date(dateFrom)` when `dateFrom` is present, and `lt: <the day after dateTo>` when `dateTo` is present, so `dateTo` is inclusive of its whole day. Both are independent and can be used alone or together.
- Search behavior (matching `number` or `customer.name`) is unchanged and combines with whichever type/date filters are active.

## Client

**`Documents.tsx` generalizes instead of a new page.** When the URL has `?type=X`, it behaves exactly as it does today: single type, no Type column, no filter chips, "New {type}" button present. When there's no `type` param, it switches to unified mode:

- Adds a **Type** column to the table, showing each row's type label (e.g. "Invoice", "Proforma invoice").
- Shows multi-select toggle chips for the 5 types above the list, letting you narrow to any combination (e.g. just Invoices + Proformas). No chips selected means no filter, i.e. all types.
- Hides the "New document" button and the empty-state's create button, since creation stays on the type-specific pages.
- Page heading reads "All documents" instead of a type's plural label.

**Date range filter.** Two date inputs, "From" and "To", added next to the existing search box, in both modes (per-type and unified). They're independent of each other and of search; all three combine as AND conditions, matching how type filtering already combines with search today. No client-side validation of `from <= to`; an inverted range just yields zero results server-side, which is an acceptable, self-explanatory outcome rather than something worth a special error path.

**Navigation.** A new "All documents" link is added to `AppLayout.tsx`, first in the list before the 5 type-specific links, pointing at the bare `/documents` route. That route is currently unused directly; it's only ever reached today with a `?type=` query string.

**`usePaginatedList`** needs no structural changes; its existing `extraParams: Record<string, string>` mechanism already supports this. `Documents.tsx` builds that object itself: a single type in per-type mode, a comma-joined string of selected types in unified mode (omitted when none selected), and `dateFrom`/`dateTo` omitted when empty rather than sent as empty strings.

## Testing

- Server: `GET /documents` tests for: multiple types via comma-separated `type` (returns matching documents from any of them), omitted `type` (returns all types), `dateFrom` only, `dateTo` only, both together (inclusive of the `dateTo` day), and confirmation that search still combines correctly with a type/date filter active.
- Client: `Documents.tsx` tests for: unified mode renders the Type column and hides the New-document button when `type` is absent from the URL; per-type mode is unchanged (existing tests keep passing); clicking a type chip narrows `extraParams.type` sent to the API; clicking a second chip adds to the filter rather than replacing it; date inputs feed `dateFrom`/`dateTo` into `extraParams`.

## Not covered here

Saved filters/views, exporting the filtered list, filtering by customer or amount range, and any changes to the per-type list pages beyond adding the date range filter.
