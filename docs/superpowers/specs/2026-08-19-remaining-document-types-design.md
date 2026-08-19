# Billa: Remaining Document Types (Stage 9)

Date: 2026-08-19

## Scope

Surface the other four document types (`PROFORMA`, `DELIVERY_NOTE`, `QUOTE`, `RECEIPT`) that the document engine and PDF pipeline were already built generically for, plus a Business Settings section to edit each type's numbering sequence. No proforma-to-invoice conversion (its own later stage, despite the `convertedFrom`/`convertedTo` relation already existing on `Document`), no document list/search beyond what already exists, no polish pass.

Because the document engine, the `/documents` API, and the PDF templates were all built parameterized by `DocumentType` from day one, this stage is small: nav links, two pieces of type-aware copy, and a settings form for endpoints that already exist and are already tested.

## Navigation

`AppLayout` gets four more flat links alongside "Invoices", one per remaining type, each pointing at `/documents?type=X`:

```
Invoices, Proforma invoices, Delivery notes, Quotes, Receipts, Customers, Items, Settings
```

Labels come from the existing `DOCUMENT_TYPE_LABELS` in `client/src/lib/documentTypeLabels.ts` (already has entries for all 5 types). No new routes: `/documents`, `/documents/new`, `/documents/:id/edit`, and `/documents/:id` already read `type` from the query string or from how the document was created.

## Type-aware copy

Two pieces of text only make sense for invoices as written today.

**Due date.** A new `shared/src/document-labels.ts` exports `getDueDateLabel(type: DocumentType): string | null`:

| Type | Label |
|------|-------|
| `INVOICE` | "Due date" |
| `PROFORMA`, `QUOTE` | "Valid until" |
| `DELIVERY_NOTE`, `RECEIPT` | `null` (field hidden) |

`DocumentForm.tsx` uses this to conditionally render the due-date `FormField` with the right label, or not at all. `DocumentView.tsx` doesn't currently display a due date in any form, so it needs no change here.

**Bill to.** The same file exports `getPartyLabel(type: DocumentType): string`: `"Deliver to"` for `DELIVERY_NOTE`, `"Bill to"` for the other four. The PDF templates already uppercase this text via CSS (`text-transform: uppercase` on `.party-label` / `.meta-box-label`), so the helper just returns the plain string.

Both helpers live in `shared` because both the client (`DocumentForm.tsx`) and the server (PDF rendering) need them, and duplicating the mapping in two places would let them drift.

`buildPdfRenderData` computes `partyLabel` and `dueDateLabel` once and stores them on `PdfRenderData`, so the three template functions (`renderMinimalHtml`, `renderFormalHtml`, `renderSidebarAccentHtml`) print what they're given instead of each hardcoding "Bill to" / "Due:". `renderMinimalHtml` doesn't currently show a due date at all (pre-existing, not something this stage changes); `renderFormalHtml` and `renderSidebarAccentHtml` swap their hardcoded "Due: …" text for `${data.dueDateLabel}: ${data.dueDate}` (only rendered when both are present).

## Sequence editor

A new `client/src/components/business/SequenceEditor.tsx`, embedded in `BusinessSettings.tsx` below the template picker: one row per document type showing its prefix and next number, both editable.

No server changes. `GET /business/sequences` and `PUT /business/sequences` already exist from the Business Profile stage, already return/accept exactly `[{ type, prefix, nextNumber }, …]` for all 5 types (defaults filled in via the existing `mergeSequences` for any type that's never been finalized), and are already tested. The form reuses the existing `updateSequencesSchema` from `shared` directly with `react-hook-form` + `zodResolver`, so client-side validation matches the server with nothing duplicated.

## Testing

- Shared: `document-labels.test.ts` covers `getDueDateLabel` and `getPartyLabel` for all 5 types.
- Server: `render-data.test.ts` gets assertions that `partyLabel`/`dueDateLabel` come out right for a `DELIVERY_NOTE` and a `QUOTE`. `formal-template.test.ts` and `sidebar-accent-template.test.ts` assert the dynamic label appears in place of the old hardcoded text.
- Client: `DocumentForm.test.tsx` gets a test confirming the due-date field is absent when `type=DELIVERY_NOTE`. `AppLayout.test.tsx` extends to check all 5 document nav links are present. `SequenceEditor.test.tsx` is new, covering load/edit/save, following the same shape as `CustomerForm.test.tsx`/`ItemForm.test.tsx`.

## Not covered here

Proforma-to-invoice conversion, document list/search beyond what `usePaginatedList` already provides, and any polish pass.
