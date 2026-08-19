# Billa: PDF Rendering (Stage 8)

Date: 2026-08-19

## Scope

Server-side PDF generation for any document (draft or finalized), in all
three templates the schema already anticipates (`MINIMAL`, `FORMAL`,
`SIDEBAR_ACCENT`), reachable from the document form/view and inline from
the documents list. A small Business Settings page is added so a business
can actually pick its default template, since nothing edits
`Business.defaultTemplate` today. No other document types' nav entries, no
proforma-to-invoice conversion, no RRA/EBM system integration beyond
displaying the number as text.

## Rendering pipeline

`server/src/lib/pdf/`:

- One pure function per template: `renderMinimalHtml(data)`,
  `renderFormalHtml(data)`, `renderSidebarAccentHtml(data)`. Each takes a
  normalized `PdfRenderData` (business, customer, document, lines, computed
  totals) and returns a complete, self-contained HTML string with an
  inline `<style>` block: no external stylesheet or font requests, no
  relative image URLs. Being pure functions from data to string, these are
  unit-testable
  with plain string assertions, no browser needed.
- `renderDocumentPdf(data)` picks the right function by `document.template`
  and passes the resulting HTML to `renderHtmlToPdfBuffer(html):
  Promise<Buffer>`, a thin wrapper around Puppeteer's `setContent` +
  `page.pdf()`.
- A single headless Chromium instance is launched once and kept warm for
  the life of the server process (module-level lazy singleton), reused
  across requests. Launching fresh per request adds real, avoidable
  latency to every download.
- Logo and both brand fonts (Fraunces, Plus Jakarta Sans, the same pairing
  used across the app) are embedded as base64 data URIs directly in the
  HTML. Both are the variable-font builds already vendored for the client
  (`@fontsource-variable/*`), so a single embedded file per family covers
  the full weight range needed (regular through bold), not just one
  weight. `setContent()` has no reliable base URL to resolve relative
  resources against, so this keeps rendering self-contained and
  deterministic regardless of host/port. If the business's logo file is
  missing or unreadable on disk, the template renders without a logo
  rather than failing the whole request.
- Templates use the business's own extracted brand color
  (`Business.primaryColor`) as their accent, not Billa's raspberry, since
  these are the SME's customer-facing documents. If no brand color has been set
  yet (e.g. onboarding was skipped), templates fall back to a neutral
  charcoal accent instead.

## Route

`GET /documents/:id/pdf`, mounted alongside the other document routes,
same `requireAuth` + tenant-scoping (404 if the document doesn't belong to
the caller's business). Response: `Content-Type: application/pdf`,
`Content-Disposition: attachment; filename="INV-0001.pdf"` for a finalized
document, or `Content-Disposition: attachment;
filename="Draft-<first 8 chars of document.id>.pdf"` for an unfinalized
one (e.g. `Draft-cmsz6yd9.pdf`); the id is stable and already unique, no
need to invent a separate short code. Available for
drafts as well as finalized documents: a draft's PDF just shows "DRAFT"
in place of a number, useful as a proof-read/preview before finalizing.

A Puppeteer failure (crash or exceeding an explicit ~10s render timeout)
returns 500 with a generic message, logged server-side; nothing about a
transient render failure should look like a data problem to the client.

## Template designs

All three share the same type pairing (Fraunces for the business name,
document title, and total amount; Plus Jakarta Sans for everything else)
and differ in layout and how much visual weight the accent color carries.

**MINIMAL**: quiet, generous white space. Logo top-left with the business
name in Fraunces beneath it; document type and number top-right. A single
thin accent-colored rule under the header is the only color block; the
line-item table is borderless with just a hairline under the column
headers. Totals sit bottom-right, plain, with only the final total set in
bold accent color.

**FORMAL**: the traditional printed-invoice feel. A light accent-tinted
header strip holds the business block; "Bill To" and document meta
(number, issue date, due date) sit in two bordered boxes side by side
beneath it. The line-item table has real grid lines and a filled
(light-accent) header row. Totals live in a bordered box with a bold,
boxed total row.

**SIDEBAR_ACCENT**: the boldest of the three. A full-height accent-colored
sidebar (~28% of page width) down the left edge carries the logo, business
contact block (address, phone, email, TIN, EBM number), and document meta
(number, dates, DRAFT/FINALIZED status). Sidebar text color (white or
dark) is chosen automatically by comparing the accent color's contrast
against both using `contrastRatio` from `server/src/lib/color.ts`
(already built for the logo color-extraction stage), so it stays legible
against any brand color. The remaining white area holds the customer
block, an unbordered line-item table, and totals bottom-right.

## Business Settings page

`client/src/pages/BusinessSettings.tsx`, routed at `/settings` and linked
from `AppLayout` nav (a "Settings" link alongside Invoices/Customers/
Items). A single form: business profile fields that currently have no UI
(name/TIN/industry/phone/email/address/EBM number all exist on the model
but only a subset is collected at onboarding) plus the template picker
(three labeled options, matching the descriptions above). Submits via the
existing `PATCH /business`, which already writes `req.body` generically;
`businessProfileSchema` just gains an optional `defaultTemplate:
z.enum(DOCUMENT_TEMPLATES)` field, no server route change needed.

Changing the default only affects documents created afterward
(`Document.template` is snapshotted at creation from
`business.defaultTemplate`, per the original schema design). Already-
finalized documents keep rendering in whatever template they were created
with.

## Client entry points

"Download PDF" appears in two places, both firing `window.open(apiUrl,
"_blank")` rather than a fetch-and-blob dance, since it's a plain
authenticated GET and the browser already sends the auth cookie and handles
`Content-Disposition` natively:

- On `DocumentForm` (draft, editable) and `DocumentView` (finalized,
  read-only), next to the existing Save draft/Finalize actions.
- Inline per row in the `Documents` list, so an old invoice can be re-
  downloaded without opening it first.

## Shared money formatter

`formatRwf` moves from `client/src/lib/money.ts` to
`shared/src/money.ts`; the client re-exports/imports it from there. The
PDF templates need the exact same formatting server-side, and duplicating
a one-line function across two workspaces just to avoid an import isn't
worth it.

## Testing

TDD throughout:

- Shared: `businessProfileSchema` test extended for `defaultTemplate`
  acceptance/rejection. `formatRwf` test moves with the function (not
  duplicated in both workspaces).
- Server: each template's HTML-generator function gets tests asserting
  the right fragments render: business name, line items, DRAFT vs. a
  real number, correctly formatted totals, logo omitted gracefully when
  absent, sidebar text color flipping correctly for a light vs. dark
  accent color. `renderHtmlToPdfBuffer` gets one real integration test
  (render trivial HTML, assert the output starts with the `%PDF` magic
  bytes) rather than mocking Puppeteer itself, matching how the rembg
  client was tested. The route test mocks the render pipeline to stay
  fast, asserting headers, filename, and the existing tenant-scoped 404
  pattern.
- Client: `BusinessSettings` (loads current values, submits changes,
  template picker). "Download PDF" buttons on `DocumentForm`,
  `DocumentView`, and `Documents`, asserting `window.open` is called
  with the right URL, not a real download.

## Not covered here

The other 4 document types' nav entries, proforma-to-invoice conversion,
document list/search beyond what already exists, any polish pass, and any
real RRA/EBM e-invoicing integration (QR codes, submission to a tax
authority API) beyond displaying the EBM number as text.
