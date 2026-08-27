# Payment Tracking and Accounts Receivable, Design

## Context

Shipping the Revenue dashboard quietly introduced money-shaped language ("revenue") into a product whose public positioning has always been "documents only, no bookkeeping." The user caught this and asked for a deliberate brainstorm rather than letting more money features drift in unplanned. Three scope decisions came out of that brainstorm, in order:

1. **Manual payment tracking only.** The owner logs payments they received outside the app (cash, bank transfer, Mobile Money). No payment gateway, no processor integration, no card/Mobile Money processing inside Billa. This does not reopen the payment-collection question (see the payments-descoped project memory: Flutterwave doesn't work cleanly for Rwanda, and a real provider is still unpicked).
2. **Recording a payment can auto-generate a Receipt.** Billa already has a `RECEIPT` document type whose whole purpose is to confirm that payment was received. Recording a payment offers to generate one in the same flow, rather than treating payments and receipts as unrelated.
3. **Stop at the "invoicing + AR tracking" tier, not full accounting.** Modeled explicitly on Zoho's own product split: Zoho Invoice (invoices, payment tracking, client portal) is a separate, lighter product from Zoho Books (adds expenses, vendor bills, bank reconciliation, financial statements). Billa stays at the Zoho Invoice tier. No expenses, no vendor bills (accounts payable), no bank reconciliation, no multi-currency, no financial statements. This also isn't a step toward that later; it would require rewriting Billa's public "no bookkeeping" commitment in the README, Terms of Service, and Landing page, which is a separate, much bigger decision this spec does not make.

Everything below fits inside that boundary.

## 1. Data model

### `Payment`, new model

```prisma
enum PaymentMethod {
  CASH
  BANK_TRANSFER
  MOBILE_MONEY
  CHEQUE
  OTHER
}

model Payment {
  id         String        @id @default(cuid())
  businessId String
  documentId String
  amount     Int
  method     PaymentMethod
  paidOn     DateTime
  notes      String?
  receiptDocumentId String? @unique

  voidedAt   DateTime?
  voidReason String?

  createdAt DateTime @default(now())
  createdByUserId String

  business Business  @relation(fields: [businessId], references: [id])
  document Document  @relation("DocumentPayments", fields: [documentId], references: [id])
  receiptDocument Document? @relation("PaymentReceipt", fields: [receiptDocumentId], references: [id])
  createdBy User      @relation(fields: [createdByUserId], references: [id])

  @@index([businessId, documentId])
}
```

An append-only ledger, not a mutable status flag. This is the part that matters given the user's own framing ("these invoices might be paid in half or not even"): multiple partial payments, each with its own date, method, and audit trail, is only representable this way. `voidedAt`/`voidReason` let the owner correct a mistaken entry without deleting history.

### `Document`, new fields (INVOICE-only in practice, same pattern as existing type-specific nullable fields like `convertedFromId` or `recurrenceInterval`)

```prisma
enum InvoicePaymentStatus {
  UNPAID
  PARTIALLY_PAID
  PAID
  WRITTEN_OFF
}

// added to model Document:
amountPaid    Int                    @default(0)
paymentStatus InvoicePaymentStatus?
writtenOffAt  DateTime?
writeOffReason String?

payments Payment[] @relation("DocumentPayments")
paymentReceiptFor Payment? @relation("PaymentReceipt")
```

`amountPaid` and `paymentStatus` are **stored and recomputed transactionally**, not computed live on every read. This matches how `Document.total` already works: computed once from lines, stored, not re-derived from `DocumentLine` rows on every request. The alternative (compute live by summing `Payment` rows on every request) would make the Accounts Receivable list page's filtering and sorting expensive; storing it keeps `WHERE paymentStatus = 'PARTIALLY_PAID'` a plain indexed query.

### `recomputeInvoicePaymentStatus(invoiceId)`, new helper (`server/src/lib/invoice-payment-status.ts`)

Analogous to the existing `calculateDocumentTotals` helper. Sums non-voided `Payment.amount` for the invoice, sums `total` of `FINALIZED` `CREDIT_NOTE` documents that reference it, and derives:

```
amountOwed = invoice.total - sumOfCreditNotes
amountPaid = sumOfNonVoidedPayments
status = amountOwed <= 0 ? "PAID"
       : amountPaid === 0 ? "UNPAID"
       : amountPaid < amountOwed ? "PARTIALLY_PAID"
       : "PAID"
```

(A `WRITTEN_OFF` status is set directly by the write-off action, not by this helper, and this helper refuses to overwrite it. Recording a payment against a written-off invoice isn't a normal flow, but if it happens, the write-off stays authoritative until explicitly reversed.)

Called after: creating a payment, voiding a payment, and, new, finalizing a `CREDIT_NOTE` that references an invoice (extends the existing finalize route). This is the one place existing code needs a hook added for credit notes to affect payment math.

## 2. Recording a payment

**`POST /documents/:id/payments`**, new route, requires the document to be `type: INVOICE` and `status: FINALIZED` (a draft isn't a real obligation yet). Body: `{ amount, method, paidOn, notes, generateReceipt: boolean }`.

- Validates `amount > 0` and `amount <= amountOwed` (can't record paying more than what's left after credit notes; over-payment isn't a case this design handles, the owner would issue a credit note or refund manually outside Billa).
- Creates the `Payment` row, calls `recomputeInvoicePaymentStatus`.
- If `generateReceipt`, creates a `FINALIZED` `RECEIPT` document in the same transaction: `referencedDocumentId` set to the invoice (satisfies the existing required-reference rule for receipts), one line `"Payment received (${method})"` for `amount` at `taxRate: 0` (the tax was already accounted for on the invoice itself, the receipt documents money received, not a new taxable sale). Links back via `Payment.receiptDocumentId`.

**`POST /documents/:id/payments/:paymentId/void`**, marks `voidedAt`/`voidReason`, recomputes status. Does not touch a linked receipt document (the receipt stays as a historical record of what was issued; the owner can separately delete it if it's still a draft, or it simply becomes inaccurate paperwork if already sent, the same tradeoff every one of these tools makes).

## 3. Overdue reminders now honor payment status

`sendOverdueReminders` (`server/src/lib/overdue-reminders.ts`) currently reminds on `status: FINALIZED, dueDate: { lt: now }` alone, so it would nag a customer who has already paid in full. Add `paymentStatus: { notIn: ["PAID", "WRITTEN_OFF"] }` to the query. A partially-paid invoice still gets reminded, correctly, since something is still owed.

## 4. Accounts Receivable page, new

`/receivables`, new sidebar link (grouped near Revenue, not under Documents). Lists every `INVOICE` with `paymentStatus` in `UNPAID`/`PARTIALLY_PAID`, aged by days past `dueDate` into the standard buckets: **0-30 / 31-60 / 61-90 / 90+**. Each row shows customer, invoice number, total, amount owed, days overdue, and a bucket badge.

- **Record payment** action opens the same form as section 2, inline.
- **Write off** action sets `paymentStatus: "WRITTEN_OFF"`, `writtenOffAt: now()`, `writeOffReason` (required, free text: "customer unreachable," "went out of business," etc.). Removes the invoice from outstanding AR; it's now tracked as a loss rather than sitting stale in the aging list forever. Reversible (a "reactivate" action clears the three fields and calls `recomputeInvoicePaymentStatus` to restore the correct real status).

## 5. Revenue dashboard updates

`GET /dashboard/revenue` (`server/src/routes/dashboard.ts`) gains, alongside the existing invoiced/credited/net figures:

- `totalCollected`: sum of non-voided `Payment.amount` in the same rolling window.
- `totalOutstanding`: sum of `amountOwed` (per the formula in section 1) across non-written-off, non-fully-paid invoices, regardless of window (this is a point-in-time balance, not a period total).
- `daysSalesOutstanding`: a deliberately simplified DSO, stated as such in the UI (not the full accrual-accounting formula). Average of `(last payment's paidOn minus invoice issueDate)` in days, across invoices that reached `PAID` status in the last 90 days. If no invoice was fully paid in that window, omit the figure rather than show a misleading zero.

The existing "invoiced" tiles stay; this adds a second row making clear that invoiced is not the same as collected.

## 6. Status badges everywhere an invoice already appears

Documents list, Dashboard recent documents, Customer statement: anywhere `DOCUMENT_TYPE_COLORS`/status badges already render, an `INVOICE` row also shows its `paymentStatus` (Unpaid / Partially paid / Paid / Written off) as a second badge. Non-invoice document types show nothing new (their `paymentStatus` is always `null`).

Customer statement (`client/src/pages/CustomerStatement.tsx`) gains an "amount owed" column, and its existing "Total on this page" figure is joined by an "Outstanding on this page" figure. This is the one existing page whose current wording ("no balance/payment-status language," per its own build note) is deliberately reversed by this feature, since accounts-receivable-by-customer is exactly what a statement page is for once payment tracking exists.

## 7. Explicitly out of scope (restated from the brainstorm, for anyone reading this spec cold)

No payment gateway or processor integration. No expense tracking. No vendor bills or accounts payable. No bank feed or reconciliation. No multi-currency. No financial statements (P&L, balance sheet, cash flow). No changes to `Document.total` or the existing document-totals calculation: payments net against total-minus-credit-notes in application logic only, and the stored `total` a document was finalized with never changes after the fact.

## 8. Testing approach

Standard TDD as used throughout the project: server-side route tests for payment creation (amount validation, over-payment rejection, non-finalized/non-invoice rejection, cross-business isolation), void, receipt auto-generation, the credit-note-finalize hook, and the overdue-reminder query change; shared-schema tests for the new Zod input schema; client tests for the record-payment form, the Accounts Receivable page (aging buckets, write-off, reactivate), and the updated Revenue/Documents/CustomerStatement surfaces. Full client and server suites plus `tsc --noEmit` on all three workspaces before considering the batch done, matching every prior batch this session.
