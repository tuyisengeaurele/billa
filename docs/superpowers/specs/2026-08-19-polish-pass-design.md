# Billa: Polish Pass (Stage 12)

Date: 2026-08-19

## Scope

An audit-and-fix pass, not a redesign: three categories of rough edges found by reviewing every page in `client/src/pages` (10 pages) plus the shared form components they use. Nothing here changes visual design, adds new features, or restructures existing patterns; it makes the app consistently follow the patterns it already mostly follows.

## 1. Bug fix: document type lost after saving

`DocumentForm.tsx` derives which document type it's editing from the URL's `?type=` query param, falling back to `"INVOICE"` when absent:

```ts
const type = (searchParams.get("type") as DocumentType) ?? "INVOICE";
```

`saveDraft` navigates to `/documents/${id}/edit` after a successful create, with no `?type=` param. On remount, `type` falls back to `"INVOICE"`, so a freshly-saved proforma (or any non-invoice type) shows "Edit invoice" / "Due date" instead of "Edit proforma invoice" / "Valid until", until the user navigates away and back through a link that does carry the param.

Fix: the loaded document response already carries a real `type` field on the wire (confirmed via `DOCUMENT_INCLUDE` on both `POST /documents` and `GET /documents/:id`; `DocumentView.tsx` already declares and uses it). `DocumentForm.tsx`'s `DocumentResponse` interface just doesn't declare it. Add `type: DocumentType` to that interface, and once a document has loaded, prefer its real type over the URL param. The URL param only matters for the "create new" case, before any document has loaded. This fixes the bug at its root instead of patching the post-save URL.

## 2. Accessibility structural basics

Three categories of gaps found, all with a concrete, consistent fix:

**Unlabeled search inputs.** The search box on `Customers.tsx`, `Documents.tsx`, and `Items.tsx` each have only a `placeholder`, no `aria-label`. Fix: add an `aria-label` matching the existing placeholder text on each (e.g. `aria-label="Search customers"`).

**Clickable table headers that aren't real buttons.** Five sortable `<th>` elements (`Customers.tsx`: name column; `Documents.tsx`: date and total columns; `Items.tsx`: description and unit price columns) have an `onClick` directly on the `<th>`, making them unreachable by keyboard and invisible to assistive tech as interactive. Fix: wrap each header's text in a real `<button type="button">` inside the `<th>`, moving the `onClick` onto the button.

**Clickable table cells/rows that aren't real buttons or links.** `Documents.tsx` has an entire `<tr onClick={...}>` (opens the document); `Customers.tsx` and `Items.tsx` each have a single `<td onClick={...}>` (opens an edit modal). Fix differs by shape, since a `<tr>` can't be wrapped in a `<button>`:
- The two single-cell cases (`Customers.tsx`, `Items.tsx`) get their `onClick` moved onto a real `<button type="button">` wrapping the cell's content, removing it from the `<td>`.
- The whole-row case (`Documents.tsx`) can't use a real button without breaking table structure, so it gets `role="button"`, `tabIndex={0}`, an `onKeyDown` handler that activates on Enter/Space, and an `aria-label` describing the row (e.g. "View invoice INV-0001" or "Edit draft").

Everything else checked was already fine and needs no change: FormField-wrapped inputs are already correctly labeled via `htmlFor`, and every icon-only button already carries an `aria-label`.

## 3. Empty/loading/error state consistency

Every list page (`Customers`, `Documents`, `Items`) and every auth/onboarding form already follows the established three-state pattern (`isLoading` flag, `role="alert"` error banner, empty-state message where relevant) correctly.

The gap is narrower and more specific: four components load a single record on mount via `apiRequest(...).then(...)` with no `.catch`, so a failed initial fetch leaves them stuck on their "Loading…" placeholder forever, with the error silently swallowed:

- `BusinessSettings.tsx`
- `SequenceEditor.tsx` (nested inside `BusinessSettings.tsx`)
- `DocumentForm.tsx`'s edit-mode load effect
- `DocumentView.tsx`

Fix, applied identically to all four: add a `.catch` that sets an error-state variable, and change each component's loading guard so an error is shown instead of an infinite "Loading…" (today the guard is a plain `if (!profile) return <Loading/>` / `if (!isLoaded) return <Loading/>` / `if (!document) return <Loading/>`, which never resolves on failure). The error banner reuses the same `role="alert"` styling already used everywhere else in the app.

## Not covered here

Visual redesign, new features, color contrast auditing (explicitly out of scope per the earlier scoping discussion), and any page or component not touched by the three sections above.
