# Bulk Actions on Items and Customers — Design

**Status:** Approved, ready for implementation planning.

## Problem

There's no way to deactivate or reactivate more than one item or customer at a
time — every row requires its own click-through-a-modal flow. For a business
doing seasonal catalog cleanup or a bulk customer archive, that's dozens of
repetitive round-trips for something that's conceptually one action.

## Scope (decided in brainstorming)

- **Items and Customers only.** Both already have a single, safe, reversible
  action (deactivate/reactivate via `PATCH .../:id { isActive }`) with a
  working reverse endpoint. Documents (more state complexity — draft /
  finalized / converted) and the admin pages (bulk actions across other
  people's accounts, higher stakes) were explicitly deferred to a possible
  later pass, not folded into this one.
- **No new backend endpoint.** Page sizes are 20 rows; the client fires the
  existing per-item `PATCH` calls in parallel via `Promise.all`. A dedicated
  bulk endpoint would only pay for itself at a scale this app doesn't operate
  at.
- **Selection resets on page change.** Not persisted across pagination in this
  pass — a deliberate v1 simplification, not an oversight.
- **Confirmation:** a simple "Deactivate N items?" Yes/Cancel modal, no typed
  confirmation — bulk actions here are already reversible via Undo (see
  below), so the single-item typed-confirmation bar (reserved for
  harder-to-reverse, higher-consequence actions like a business delete) would
  be friction without a matching safety benefit.

## UI

- **Selection column** — a checkbox as the first column in both tables. The
  header checkbox selects/deselects every row on the current page (indeterminate
  state when some but not all are selected). Each row gets its own checkbox.
- **Action bar** — appears above the table only when 1+ rows are selected,
  replacing the current search/export toolbar row in place (not an additional
  sticky bar) to avoid adding permanent vertical space when nothing is
  selected. Computes two counts from the current selection — how many selected
  rows are active, how many are inactive — and shows up to two buttons
  accordingly:
  - "Deactivate (N)" — shown only if the selection includes at least one
    active row; acts only on the active ones.
  - "Reactivate (N)" — shown only if the selection includes at least one
    inactive row; acts only on the inactive ones.
  - "Clear selection" — always shown alongside, deselects everything.

  Both buttons can appear together for a mixed selection (only possible when
  "Show inactive" is checked, since the default view only shows active rows).

- **Confirmation modal** — "Deactivate N items?" / "Reactivate N items?" with
  a plain Yes/Cancel, matching the design decision above.

## Execution and feedback

On confirm, fire `Promise.all` across every affected row's existing `PATCH`
call. Once all resolve:
- Clear the selection and reload the list (same `list.reload()` already used
  by the single-item flow).
- Show a toast: `"5 items deactivated"` / `"5 customers reactivated"` — same
  toast system, singular wording ("1 item deactivated") when N is 1, extending
  the existing `Toast`/`ToastContext` action-button feature already shipped
  today rather than a new mechanism.
- The toast's Undo action re-fires the same `Promise.all` pattern in reverse
  (deactivated → reactivate, reactivate → deactivate) across the same batch of
  IDs, then shows its own confirmation toast — same shape as the single-item
  Undo already shipped.

**Partial failure:** if some of the parallel requests fail and others
succeed (e.g. one item was already modified by someone else), the toast
reports what actually happened — `"3 of 5 items deactivated"` — as an error
toast (not success), and the list still reloads to reflect whatever did
succeed. No partial-failure retry mechanism in this pass; the user can just
re-select the ones that didn't take and try again, same as they would for any
other failed action.

## Testing plan

- `client/src/pages/Items.test.tsx` / `Customers.test.tsx` — selecting rows
  shows the action bar with correct counts; a mixed active/inactive selection
  shows both buttons; confirming bulk-deactivate fires parallel PATCH calls,
  reloads the list, and shows the plural/singular toast correctly; Undo on
  that toast reactivates the whole batch; a partial failure shows the
  "X of Y" error toast.

## Out of scope for this pass

- Documents and the admin pages (explicitly deferred above).
- A dedicated bulk backend endpoint.
- Selection persisting across pagination or across a page reload.
- Bulk actions beyond deactivate/reactivate (e.g. bulk export of only the
  selected rows — the existing CSV export already exports the full filtered
  list, which is a related but different feature not asked for here).
