# Billa: Document Engine, Invoice First (Stage 7)

Date: 2026-08-19

## Scope

A generic document CRUD system (customer/date/notes header plus a line-items
table, backed by the existing `Document`/`DocumentLine` schema) built to
work for all 5 `DocumentType`s from day one, but with only the invoice UI
surfaced this stage. No PDF rendering (a separate later stage), no
proforma-to-invoice conversion (uses the existing `convertedFrom`/
`convertedTo` relation, but that's its own later stage), no other document
types' nav entries yet.

## Schema change

`Document.number` becomes nullable. Currently `number String` (required);
drafts need to exist with no number assigned yet, since numbering happens
only at finalize (see below). Postgres allows multiple `NULL`s under the
existing `@@unique([businessId, type, number])` constraint, so nothing else
about that index needs to change. This requires a new Prisma migration.

## API

`server/src/routes/documents.ts`, generic across all `DocumentType`s,
mounted behind `requireAuth`, tenant-scoped like every other resource:

| Method | Path                      | Notes                                                       |
|--------|---------------------------|---------------------------------------------------------------|
| GET    | `/documents`              | `?type=INVOICE&search=&sortBy=&sortOrder=&page=&pageSize=`, same envelope shape as `/customers` and `/items`: `{ results, total, page, pageSize }` |
| POST   | `/documents`               | create a draft: `{ type, customerId, issueDate, dueDate?, notes?, lines }` |
| GET    | `/documents/:id`           | full detail including lines                                   |
| PATCH  | `/documents/:id`           | update a draft's header + full line set; rejected if finalized |
| POST   | `/documents/:id/finalize`  | assigns the permanent number, locks the document               |
| DELETE | `/documents/:id`           | drafts only; rejected if finalized                              |

**Whole-document save, not granular line endpoints.** `POST` and `PATCH`
both accept the complete line array and atomically replace all
`DocumentLine` rows for that document inside one transaction, alongside
recomputing and storing the header totals. The client edits the whole form
as one unit before saving, so this matches the actual editing model.
There's no scenario here where exposing per-line endpoints would help, and
it would only create more ways for totals to drift out of sync with the
lines that produced them.

**Totals are always server-computed, never trusted from the client.** Per
line: `lineTotal = round(quantity × unitPrice)`, line tax `=
round(lineTotal × taxRate / 100)`. Document `subtotal = Σ lineTotal`,
`taxTotal = Σ line tax`, `total = subtotal + taxTotal`. All stored as RWF
integers (no decimal subunits, consistent with every other money field in
this project). A client-supplied total is never written to the database;
this is a correctness and integrity requirement, not a style choice.

## Numbering and the draft/finalize lifecycle

`POST /documents/:id/finalize` runs in a transaction:

1. Reject if the document has zero lines (an empty document can't become a
   real invoice) or is already finalized.
2. Read (or create, using the existing `mergeSequences` default-prefix
   logic) the `DocumentSequence` row for `(businessId, type)`.
3. Increment `nextNumber`, format as `{prefix}{nextNumber padded to 4
   digits}` (e.g. `INV-0001`).
4. Set `document.number` and `status: FINALIZED`.

Once finalized, `PATCH` and `DELETE` both reject the request. A real
invoice number, once issued, shouldn't silently change or vanish. Drafts
can be freely edited or deleted, since they never held a real number;
deleting one leaves no gap in the sequence.

## Client

`client/src/pages/Documents.tsx` reuses `usePaginatedList` unchanged (same
hook Customers/Items already use). For this stage, `AppLayout` gets one new
nav link, **"Invoices"**, pointing at `/documents?type=INVOICE`. Because the
list/form components take `type` as a parameter rather than being
hard-coded, adding "Quotes" etc. later is a matter of a new nav link plus
minor type-specific copy, not new CRUD.

The list page shows: number (or "Draft" if unfinalized), customer name,
issue date, total (via the existing `formatRwf` helper), and status.
Clicking a draft row opens the edit form; clicking a finalized row opens a
read-only view instead, matching the "no longer freely editable" rule. A
"New invoice" button starts a blank draft.

`client/src/pages/DocumentForm.tsx` is a full page (`/documents/new?type=
INVOICE`, `/documents/:id/edit`), not a modal. A slide-over is too
cramped for a growing line-items table:

- Header: customer (searchable select from the Customer catalog), issue
  date (defaults to today), due date (optional), notes (optional).
- Line-items table: each row has an item picker (searchable, from the Item
  catalog) that auto-fills description and unit price on selection: every
  field (description, quantity, unit price, tax rate) stays independently
  editable afterward, so a one-off charge or a per-customer discount is
  just editing the row post-pick. Tax rate defaults to 18% on a new row.
  "Add line" appends an empty row; each row has a remove button.
- A subtotal/tax/total footer, recomputed client-side live as the user
  types for immediate feedback. This is cosmetic only: the authoritative
  numbers always come from the server's response after a save, since the
  server recomputes everything from the submitted lines.
- Two actions: **Save draft** (`POST` or `PATCH`, stays editable) and
  **Finalize** (behind a confirm step, since it's one-way).

## Validation

`shared/src/document-schemas.ts`:

- `documentLineSchema`: `description` (required, trimmed), `quantity`
  (positive decimal), `unitPrice` (non-negative integer), `taxRate`
  (0–100), `itemId` (optional string).
- `documentSchema`: `type` (one of `DOCUMENT_TYPES`), `customerId`
  (required), `issueDate` (required), `dueDate` (optional), `notes`
  (optional), `lines` (array of `documentLineSchema`, may be empty; the
  "at least one line" rule is enforced only at finalize, not at draft
  save, since a draft can legitimately be a work in progress).

Error handling matches the established pattern: inline field errors from
Zod, an API-failure banner on save, a confirm step before finalize, and a
friendly error if finalizing an empty draft.

## Testing

TDD throughout, matching the depth already established for customers/items:

- Shared: schema tests for `documentSchema` and `documentLineSchema`.
- Server: route tests per endpoint: create, update (including rejection
  once finalized), finalize (numbering/transaction behavior, "can't
  finalize empty", sequence increments correctly across repeated
  finalizes), delete (including "can't delete finalized"), tenant
  isolation, 401s without a session.
- Client: `DocumentForm` (line add/remove, item-picker autofill, live
  total calculation, save vs. finalize, confirm step), `Documents` list
  page (rendering, status display, the type-scoped nav entry). Search,
  sort, and pagination behavior are not retested here since they're
  already covered by `usePaginatedList`'s own tests.

## Not covered here

PDF rendering, the other 4 document types' nav entries and any
type-specific copy/labels, proforma-to-invoice conversion, editing a
finalized document (e.g. a correction/credit-note flow), and any document
search beyond what the shared list hook already provides.
