# Global Search / Command Palette — Design

**Status:** Approved, ready for implementation planning.

## Problem

There's no fast way to jump to a specific customer, item, or document from anywhere
in the business app. Each list page (Customers, Items, Documents) has its own local
search box, but finding "that invoice for Acme Ltd" means first navigating to
Documents, then typing. This is the single highest-leverage "feels premium" gap
identified in the 2026-08-28 UI/UX brainstorm (see [[project_toast_system_2026_08_28]]
for the first two items from that same brainstorm, both already shipped).

## Scope (decided in brainstorming)

- **Data only** — searches customers, items, and documents. No page-navigation
  entries ("jump to Settings") and no actions ("New invoice") in this pass — those
  were explicitly descoped to keep this contained.
- **Business app only** — not the admin app. Admin's per-page search stays as-is.
- **Discoverable** — a visible "Search... ⌘K" pill in the top bar, not just a
  keyboard shortcut nobody would find on their own.

## Backend

One new route, following the exact pattern already used by every other resource
list route (`customers.ts`, `items.ts`, `documents.ts`) — `requireAuth` +
`requireActiveSubscription` middleware, business-scoped `where`, same
`contains`/`insensitive` matching already proven there:

- `shared/src/search-schemas.ts` — new file:
  ```ts
  export const searchQuerySchema = z.object({
    q: z.string().trim().min(2).max(100),
  });
  export type SearchQuery = z.infer<typeof searchQuerySchema>;
  ```
  The `min(2)` means a single keystroke never hits the database — matches how a
  palette should behave anyway (no useful match on one character).

- `server/src/routes/search.ts` — new file. `GET /` (mounted at `/search` in
  `app.ts`, alongside the other `app.use("/resource", resourceRouter)` lines),
  validated with `searchQuerySchema` via the existing `validateQuery` middleware.
  Runs three Prisma queries in parallel (`Promise.all`), each scoped to
  `req.auth!.businessId` and capped at `take: 5`:
  - Customers: `where: { businessId, name: { contains: q, mode: "insensitive" } }`
  - Items: `where: { businessId, description: { contains: q, mode: "insensitive" } }`
  - Documents: `where: { businessId, OR: [{ number: { contains: q, mode: "insensitive" } }, { customer: { name: { contains: q, mode: "insensitive" } } }] }`,
    `include: { customer: { select: { name: true } } }`

  Maps each to a common shape and returns them grouped by type in a fixed order
  (customers, then items, then documents — no relevance ranking infrastructure
  exists in this codebase, so a fixed, predictable order beats a fake "smart" one):

  ```ts
  interface SearchResult {
    type: "customer" | "item" | "document";
    id: string;
    label: string;              // customer.name / item.description / document.number ?? "Draft"
    sublabel: string;           // customer.phone ?? customer.email ?? "" / formatRwf(item.unitPrice) / customer.name
    documentType?: DocumentType; // only present when type === "document"; raw enum value
    href: string;                // see below
  }
  // response: { results: SearchResult[] }
  ```

  For a document result, the server sends the raw `documentType` (e.g.
  `"INVOICE"`) and `sublabel: customer.name` — it does **not** try to build a
  pretty label like "Invoice · Kigali Traders" itself, because that mapping
  (`DOCUMENT_TYPE_LABELS`) lives in `client/src/lib/documentTypeLabels.ts`, a
  client-only file with no `shared/` equivalent. The client composes the final
  sublabel as `` `${DOCUMENT_TYPE_LABELS[result.documentType].singular} · ${result.sublabel}` ``
  — same division of labor already used everywhere else in the app (the server
  always sends the raw `type` enum; every client page does its own labeling via
  `DOCUMENT_TYPE_LABELS`).

  **A real asymmetry, not a bug being introduced:** items have no individual page
  in this app today — they only exist inside an edit modal on the Items list. So
  an item result's `href` is just `/items` (the list), not a deep link to that
  specific item pre-opened. Customers link to `/customers/:id/statement` (their
  closest thing to a detail page) and documents link to `/documents/:id`.

## Frontend

- `client/src/components/SearchPalette.tsx` — new component. Visually matches
  `Modal.tsx`'s existing look (portal via `createPortal`, backdrop-blur,
  `rounded-2xl`/`shadow-2xl`, the same framer-motion fade/scale transition), but
  is its own component because the interaction model is genuinely different: an
  autofocus search input instead of a title, and an arrow-key-navigable result
  list instead of form content. `role="dialog"` on the container,
  `role="listbox"` on the results with each result `role="option"` /
  `aria-selected`.

- **Fetch logic** — deliberately copies the debounce pattern already established
  in `usePaginatedList.ts` (a 300ms `setTimeout` inside a `useEffect`, with a
  `cancelled` boolean closure flag set in the cleanup function to guard against a
  slow, stale response overwriting a newer one) rather than inventing a new
  debounce utility. Same convention, same file-local pattern, no new dependency.

- **States** — empty query: a hint ("Search customers, items, and documents").
  Loading: a subtle in-place indicator, not a layout-shifting skeleton. No
  results: `No results for "<query>"`. Results: grouped under "Customers" /
  "Items" / "Documents" section headers, each section showing up to 5 (matching
  the backend's per-type cap).

- **Keyboard** — `ArrowDown`/`ArrowUp` move the selected result (wrapping at the
  ends), `Enter` navigates to the selected result and closes the palette,
  `Escape` closes and returns focus to the trigger pill that opened it.

- **Trigger** — `client/src/components/SearchPaletteTrigger.tsx`, a pill reading
  "Search... ⌘K" (or "Ctrl+K" on non-Mac, via a small platform sniff on
  `navigator.userAgent`/`navigator.platform`), placed in `AppLayout.tsx`'s header
  next to `PageTitleBreadcrumb`. A global `keydown` listener (added in
  `AppLayout.tsx`, removed on unmount) opens the palette on
  `(event.metaKey || event.ctrlKey) && event.key === "k"` with
  `event.preventDefault()`, from anywhere in the business app — matching how
  Cmd+K behaves as a global override in Slack, Linear, and VS Code, not gated on
  focus being outside another input.

- **Selecting a result** — `navigate(href)` via `react-router-dom`'s `useNavigate`,
  then closes the palette.

## Testing plan

- `server/src/routes/search.test.ts` — matches returned per type; business-scoping
  (a match belonging to a different business never appears); `q` shorter than 2
  characters rejected (400); unauthenticated request rejected.
- `client/src/components/SearchPalette.test.tsx` — renders grouped results from a
  mocked response; arrow-key navigation moves selection; `Enter` navigates and
  closes; `Escape` closes and restores focus; a query that resolves after being
  superseded by a newer one is discarded (the stale-response guard actually
  works, not just present in the code).
- `client/src/components/AppLayout.test.tsx` — extend with a test that
  `Cmd/Ctrl+K` opens the palette from the layout shell.

## Out of scope for this pass

- Page-navigation entries and in-palette actions (explicitly descoped above).
- Admin app support (explicitly descoped above).
- Relevance ranking / fuzzy matching — the existing `contains`/`insensitive` match
  already used by every list page's search box is the bar here, not a new
  search-quality investment.
- Recent-searches / search history — no persistence layer for this exists and
  wasn't asked for.
