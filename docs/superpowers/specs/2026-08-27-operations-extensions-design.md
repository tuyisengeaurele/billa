# Day-to-Day Operations Extensions, Design

## Context

After the payment tracking and Accounts Receivable design (`2026-08-27-payment-tracking-design.md`), the user asked for a wider brainstorm: what else reflects how a real business actually operates day to day, still inside the "documents plus AR tracking" boundary (no bookkeeping, no inventory, no direct RRA filing, no payment gateway). From that list, seven items were picked to build. This spec covers all seven, in the order they'll likely get built (see Sequencing at the end).

## 1. Quote accept/decline

Proformas already have a public accept flow (`POST /public/documents/:token/accept`, via `convertProformaToInvoice` in `server/src/lib/convert-proforma.ts`). Quotes never got the same treatment, despite being functionally identical to proformas in every other way Billa already treats them (`getDueDateLabel` labels both "Valid until").

**Change:** relax the type check inside `convertProformaToInvoice` from `proforma.type !== "PROFORMA"` to `!["PROFORMA", "QUOTE"].includes(proforma.type)`. Same function, same route, now serves both. No rename needed; the existing name stays accurate enough since a quote converting to an invoice is exactly what it already does for proformas.

**New: decline.** Accepting was always one-directional (converts to invoice). Declining is new: add `declinedAt DateTime?` to `Document` (meaningful for `PROFORMA`/`QUOTE` only, same pattern as every other type-specific nullable field already on this model). New route `POST /public/documents/:token/decline` sets it, refusing if already accepted (`convertedTo` set) or already declined. Accepting refuses if already declined, and vice versa. The public document view shows a "Decline" button next to "Accept," and once declined, shows "You declined this quote/proforma" instead of the accept/decline pair. The owner sees the outcome (accepted, declined, or still pending) as a badge anywhere the document already appears.

## 2. Customer PO/reference field

`customerReference String?` on `Document`. A free-text field the owner fills in when a customer supplies their own purchase-order or reference number, most relevant for `INVOICE` but harmless to allow on any type. Shown as an optional field in `DocumentForm`, printed on both PDF templates near the existing customer/bill-to block, and shown on the public document view. Not added to search (a separate decision if it turns out customers want to search by it later).

## 3. Line-item discounts

The single largest item in this batch, worth calling out plainly: this touches `DocumentLine`'s schema, `calculateDocumentTotals`, both PDF templates, `DocumentForm`, and the shared Zod line schema all at once, because discount has to be applied before tax at the same place tax already gets calculated.

**Scope decision for this pass: line-level only, not a separate document-level discount.** A blanket "10% off the whole invoice" is common too, but modeling it well (does it apply before or after line discounts, how does it interact with tax) is its own design question. Line-level discounts alone cover the common case (a specific item is discounted) and keep this from becoming two features. Document-level discounts can be a later addition if it turns out line-level isn't enough in practice.

**`DocumentLine`, new fields:**

```prisma
discountType  DiscountType?  // PERCENT | FLAT
discountValue Decimal?       @db.Decimal(10, 2)
```

**`calculateDocumentTotals`, updated math** (in `server/src/lib/document-totals.ts`):

```
rawLineTotal = round(quantity * unitPrice)
discountAmount = discountType === "PERCENT" ? round(rawLineTotal * discountValue / 100)
               : discountType === "FLAT" ? round(discountValue)
               : 0
discountedSubtotal = rawLineTotal - discountAmount
taxAmount = round(discountedSubtotal * taxRate / 100)
lineTotal = discountedSubtotal + taxAmount
```

`discountAmount` is clamped so it can never exceed `rawLineTotal` (a discount can't make a line negative). Document `subtotal` becomes the sum of `discountedSubtotal` across lines (so the printed subtotal already reflects discounts, matching how every invoicing tool shows it), `taxTotal` and `total` unchanged in shape.

**Display:** both PDF templates show the discount inline on the line (for example a struck-through original price next to the discounted one, or a plain "Discount: 2,000 RWF" sub-line, exact treatment decided at implementation time to fit each template's existing layout rather than prescribed here). `DocumentForm` gets a discount type/value input per line, collapsed by default (most lines have no discount) so it doesn't clutter the common case.

## 4. VAT/tax summary report

New route `GET /reports/tax-summary?from=&to=`, scoped to the authenticated business. Sums `taxTotal` (and `subtotal`, for context) across `FINALIZED` `INVOICE` documents in the date range, net of `FINALIZED` `CREDIT_NOTE` documents referencing them in the same range, grouped by the tax rate actually used on each line (almost always Rwanda's standard 18%, but not hardcoded, since a line's `taxRate` is freely set today). New page or a new tab on the existing Revenue page (implementation detail to decide when building; a tab keeps related money-reporting together rather than adding another sidebar link for a single report). Purely informational: a number the owner copies into their own RRA filing by hand. Billa never talks to RRA.

## 5. Owner payment digest

Depends on the `Payment` model from the payment-tracking spec existing first. A new weekly job alongside the existing scheduler (`server/src/lib/scheduler.ts`, which already runs recurring-documents and overdue-reminders hourly): once a week, for each active business, compute total collected in the last 7 days and count of invoices that newly crossed into overdue in the last 7 days, and email the owner (not the customer) a short plain-text-style summary, reusing the existing `sendDocumentEmail`/Resend plumbing. Recorded via the existing `JobRunLog` pattern, same as the other two scheduled jobs. No new UI; this is an email-only feature, matching how overdue reminders work today (no in-app equivalent exists for those either, and building one is exactly the "notification bell" already deferred as too big).

## 6. Full client portal

Today, a customer gets one unauthenticated link per document (`Document.publicToken`). This adds the same pattern one level up: a stable, unguessable link per **customer**, listing every finalized document that customer has ever received from that business, not just one at a time.

**`Customer`, new field:** `portalToken String @unique @default(dbgenerated("gen_random_uuid()::text"))`, same mechanism `Document.publicToken` already uses.

**New route:** `GET /public/customers/:token`, returns the customer's name plus every `FINALIZED` document from that business (reusing the same shape `CustomerStatement.tsx` already renders for the authenticated, owner-facing version), no login required.

**New page:** `client/src/pages/PublicCustomerPortal.tsx`, structurally a public sibling of the existing `CustomerStatement.tsx`, showing paid/outstanding per document once payment tracking exists (this is why the portal is sequenced after payment tracking: an AR-blind portal is a much smaller win).

**Owner-facing:** a "Copy portal link" action on the Customer detail page, so the owner can hand a repeat customer one link instead of resending a new link per document.

No customer login, no password, no OTP. The token is the entire access control, same trust model Billa already uses for every other public document link.

## 7. Full data export

One-click download of everything (documents, customers, items) instead of the three separate CSV exports that exist today (`/documents/export.csv`, `/customers/export.csv`, `/items/export.csv`). New route `GET /export/all`, returning a single JSON file with three arrays (`documents`, `customers`, `items`), reusing the same query logic those three routes already have, just combined into one response instead of one route per resource. JSON, not a zip of the existing CSVs, so this adds no new dependency (no zip library needed) and stays a plain `res.json()` response the existing `downloadFile()` client helper already knows how to save. A "Export all data" button on the Settings page, near the existing danger-zone/account-deletion controls, framed as the data-portability counterpart to that section.

## Sequencing

1. Payment tracking and Accounts Receivable (already spec'd, unblocks items 5 and 6 below).
2. Quote accept/decline, customer PO field, VAT summary report, full data export: independent of payment tracking and of each other, can be built in any order.
3. Owner payment digest, full client portal: depend on the `Payment` model existing.
4. Line-item discounts: independent of the others, but the biggest single change in this batch (schema plus totals plus both PDF templates plus the form), worth its own dedicated pass rather than interleaving with the smaller items.

## Explicitly still out of scope

Everything the payment-tracking spec already ruled out (payment gateway, expenses, vendor bills, bank reconciliation, multi-currency, financial statements), plus, new for this batch: document-level discounts (line-level only, for now), customer login/password for the portal (token-only, same as every other public link), and any actual submission to RRA (the tax summary report is read-only arithmetic for the owner, never a filing).
