# Billa: Proforma-to-Invoice Conversion (Stage 10)

Date: 2026-08-19

## Scope

A one-way action that turns a finalized proforma invoice into a new draft invoice, using the `convertedFromId` / `convertedTo` self-relation already built into the `Document` model from the original schema design. No document list/search changes, no polish pass.

## Endpoint

`POST /documents/:id/convert`, mounted alongside the existing `/finalize` sub-resource route, same tenant scoping. Allowed only when all of the following hold:

- The document belongs to the caller's business (otherwise 404, matching every other document route).
- `type` is `PROFORMA` (otherwise 400: converting anything else isn't meaningful).
- `status` is `FINALIZED` (otherwise 409: a proforma is normally sent to a customer for confirmation before it becomes a real invoice; converting a draft doesn't match that workflow, and the user can just create the invoice directly instead).
- `convertedTo` is still null (otherwise 409: `convertedFromId` is a unique field on the schema, so one proforma can only ever produce one invoice).

On success it creates a new `Document` in one step (no transaction needed beyond Prisma's own nested-create atomicity, since nothing else is being read-then-written the way `/finalize`'s sequence number is):

- `type: INVOICE`, `status: DRAFT` (no number assigned yet, same as any other new draft).
- `customerId`, `notes` copied from the proforma.
- `issueDate` set to today, not copied from the proforma. It's a new transaction happening now; this also matches what a fresh "New invoice" already defaults to.
- `template` set from the business's *current* `defaultTemplate`, not copied from the proforma. Every other document creation path already follows this rule, so conversion doesn't get a special case.
- Line items copied (`description`, `quantity`, `unitPrice`, `taxRate`, `itemId` for traceability), but `subtotal`/`taxTotal`/`total` and each line's `lineTotal` are always recomputed from those lines via the existing `calculateDocumentTotals`, never copied wholesale. Totals are never trusted from anywhere but a fresh computation, and that rule doesn't get an exception here either.
- `convertedFromId` set to the proforma's id.

The response is the new draft invoice, in the same shape `POST /documents` and `GET /documents/:id` already return.

## Traceability both ways

`DOCUMENT_INCLUDE` (the shared include object already used by every document route) gains two more relations:

```ts
convertedFrom: { select: { id: true, number: true, type: true } },
convertedTo: { select: { id: true, number: true, type: true } },
```

Both are `null` on documents that aren't involved in a conversion, so this is a no-op for every existing document type and doesn't change any current test's expectations beyond adding two always-present-but-usually-null fields.

## Client

**On a proforma's read-only view** (`DocumentView.tsx`, which currently has no `type` field in its response interface and needs one): if `type` is `PROFORMA` and `status` is `FINALIZED`, show a "Convert to invoice" button next to the existing Download PDF button, behind a `window.confirm` guard matching the existing Finalize button's pattern. On success, navigate to the new invoice's edit URL, matching how saving a draft already navigates. If `convertedTo` is already set (rather than null), the button is replaced entirely by a link: "Converted to invoice {number}", pointing at `/documents/{convertedTo.id}`. There's no disabled-button state to build, since the two are mutually exclusive.

**On the resulting invoice**, since it starts as a draft: `DocumentForm.tsx` shows a small "Converted from proforma {number}" link (to `/documents/{convertedFrom.id}`) when editing a document whose `convertedFrom` is set. The same link appears again on `DocumentView.tsx` once the invoice is finalized, so the connection isn't lost either way it's viewed.

## Error handling

Matches the established pattern exactly: a failed conversion attempt (wrong type, not finalized, already converted) shows an inline error banner, same as a failed finalize attempt. No new error-handling pattern is introduced.

## Testing

- Server: route tests for `POST /documents/:id/convert`: success case (correct copied fields, correct fresh computation of totals, `convertedFromId` set, new document is a `DRAFT` `INVOICE`), rejects a draft proforma (409), rejects a non-proforma type (400), rejects converting the same proforma twice (409), tenant isolation (404), 401 without a session.
- Client: `DocumentView` shows the "Convert to invoice" button only for a finalized proforma, shows the "Converted to invoice" link instead once `convertedTo` is set, navigates correctly after conversion. `DocumentForm` shows the "Converted from proforma" link when `convertedFrom` is present and omits it otherwise.

## Not covered here

Document list/search changes, any polish pass, and any handling beyond the single proforma-to-invoice direction (no delivery-note-to-invoice or quote-to-invoice conversion, since only proforma has the `convertedFrom`/`convertedTo` relation and the README scopes this stage to proforma specifically).
