# Billa: Customer & Item CRUD (Stage 6)

Date: 2026-08-19

## Scope

Backend CRUD for `Customer` and `Item` (both models already exist in the
Prisma schema), a minimal authenticated app shell to reach them from, and
list/create/edit UI for both. This is the catalog data the document engine
(invoices, quotes, etc., a later stage) will pull from.

## Backend API

Two new route files, `server/src/routes/customers.ts` and
`server/src/routes/items.ts`, following the same tenant-isolation pattern as
`business.ts`: mounted behind `requireAuth`, every query scoped to
`req.auth.businessId`, never a business ID taken from the request.

New shared schemas:

- `shared/src/customer-schemas.ts`, `customerSchema`: `name` (required,
  trimmed, min 1), `tin` / `address` / `phone` (optional trimmed strings),
  `email` (optional, validated format when present).
- `shared/src/item-schemas.ts`, `itemSchema`: `description` (required,
  trimmed, min 1), `unitPrice` (required positive integer, RWF), `unit`
  (required non-empty trimmed string; no fixed enum server-side, the preset
  dropdown on the client is a UI affordance for consistency, not a data
  constraint).

Both resources expose the same endpoint shape:

| Method | Path             | Notes                                                          |
|--------|------------------|-----------------------------------------------------------------|
| GET    | `/customers`     | `?search=&sortBy=name\|createdAt&sortOrder=asc\|desc&page=&pageSize=&includeInactive=false` |
| POST   | `/customers`     | create                                                          |
| PATCH  | `/customers/:id` | partial update, including `{ isActive: false }` to deactivate and `{ isActive: true }` to reactivate |

Same shape for `/items`, with `sortBy=description|unitPrice|createdAt`.
Default `pageSize` is 20; default `sortBy` is `createdAt` with `sortOrder`
`desc` (newest first) when neither is specified. `GET` response shape:
`{ customers: [...], total, page, pageSize }` (analogous for items).

No DELETE endpoint on either resource (see "Deactivate, not delete" below).
No GET-by-id endpoint either: the edit panel pre-fills from the row data
already present in the list response, so a second round-trip isn't needed.

**Deactivate, not delete.** `isActive` already exists on both models because
`Document` references `Customer` and `Item`; hard-deleting either would
break historical documents. The UI never offers a destructive delete,
only deactivate/reactivate through the same PATCH endpoint.

## App shell & navigation

New `client/src/components/AppLayout.tsx` wraps every authenticated page
from this stage on (Dashboard, Customers, Items): a slim top bar with the
Billa mark on the left, "Customers" and "Items" nav links in the center, and
a logout button on the right. `Dashboard.tsx`'s welcome message moves inside
this shell rather than standing alone on an empty page.

Routes added to `App.tsx`: `/customers` and `/items`, under the same
`ProtectedRoute` wrapper `/dashboard` and `/onboarding` already use.

No sidebar, no collapsing menu, nothing that anticipates sections that don't
exist yet (documents, settings). Revisited once the document engine stage
defines what else needs a home in the nav.

## List screens

`client/src/pages/Customers.tsx` and `client/src/pages/Items.tsx` share the
same interaction shape:

- A search input, debounced around 300ms, filtering server-side via the
  `search` query param.
- Sortable column headers (name/date for customers; description/price/date
  for items) that toggle ascending/descending and re-fetch.
- Pagination controls at the bottom (page numbers, previous/next).
- A "Show inactive" toggle, off by default, that adds
  `includeInactive=true` when switched on. Inactive rows render visibly
  dimmed once shown, with a "Reactivate" action instead of "Deactivate".
- Each active row gets a "Deactivate" action behind a small confirm step,
  since it does have a real effect (drops the entry out of future document
  pickers), even though nothing is destroyed.
- An empty state when there's nothing yet: a prompt plus the "Add customer"
  / "Add item" button, not a blank table.
- A designed loading state while a page/search/sort request is in flight
  (skeleton rows, not a spinner overlay).

Item unit prices render through a new shared `client/src/lib/money.ts`
helper, `formatRwf(amountInRwf: number): string`, producing values like
"12,500 RWF" (thousands separator, RWF suffix, no decimals since RWF has no
subunits). This gets reused by the document engine stage later.

## Create/edit panel

A shared `client/src/components/Modal.tsx`: a slide-over panel anchored to
the right edge. Backdrop is a blurred, dimmed overlay (`backdrop-blur` plus
a semi-transparent black layer); the panel itself slides in with
framer-motion. Closes on backdrop click, an X button, or Escape. This
becomes the general-purpose modal primitive for the app going forward, not
just for this stage.

`client/src/components/customers/CustomerForm.tsx` and
`client/src/components/items/ItemForm.tsx` render inside the panel:

- **CustomerForm**: name, TIN, address, phone, email. Same blank-tolerant
  local Zod schema pattern as onboarding's `DetailsStep` (the required
  field validates normally; optional fields don't choke on an empty string;
  only non-empty fields get sent in the payload).
- **ItemForm**: description, unit price (plain number input, RWF), unit (a
  dropdown: piece, kg, liter, hour, day, service, box, other; picking
  "other" reveals a text input whose value becomes what's actually sent).

Both forms:

- "Add customer" / "Add item" opens the panel empty.
- Clicking a row (or an explicit edit icon) opens the panel pre-filled from
  that row's data.
- Save calls POST (create) or PATCH (edit), closes the panel on success,
  and refreshes the current list page.
- Inline validation errors and an API-failure banner, consistent with every
  other form in the app so far.

## Testing

TDD throughout, following the existing pattern:

- Server: route tests per endpoint per resource (list with
  search/sort/pagination/includeInactive, create, validation rejection,
  partial update, deactivate/reactivate, tenant isolation, 401 without a
  session), mirroring the structure already used for `business.ts`'s tests.
- Shared: schema tests for `customerSchema` and `itemSchema`.
- Client: `Modal` (open/close/backdrop/Escape), `CustomerForm` and
  `ItemForm` (render, validation, submit payload), `Customers.tsx` and
  `Items.tsx` (list rendering, search, sort, pagination, deactivate flow,
  empty state), `AppLayout` (renders nav, logout works).

## Not covered here

The document engine (invoices, quotes, etc.) that will actually consume
this catalog data, a Settings page, and any richer navigation shell. None
of that exists yet and isn't needed for this stage.
