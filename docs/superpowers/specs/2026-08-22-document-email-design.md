# Document Emailing Design

**Goal:** Let a business email a finalized document straight to its customer, with the same PDF that "Download PDF" already produces, and remember when it was last sent.

## Scope

Only finalized documents can be emailed — a draft's number and content can still change, so sending it would risk emailing something that isn't final. A customer with no email on file can't be emailed to; the UI makes that limitation visible rather than silently failing.

## Data

`Document` gains one field: `sentAt DateTime?`. Nothing else changes about the document model.

## Backend

`POST /documents/:id/send` (new route in `documents.ts`, same auth/business-scoping as every other document route):

1. Look up the document (business-scoped, 404 if not found), include `customer` and `lines`.
2. 409 `not_finalized` if the document is still a draft.
3. 400 `customer_has_no_email` if the customer has no email on file.
4. Build the same `PdfRenderData` and call the same `renderDocumentPdf` the existing `/pdf` download route already uses — one rendering pipeline, two delivery mechanisms.
5. Send via a new `sendDocumentEmail` helper (a thin wrapper around the Resend SDK, mirroring how `flutterwave.ts` wraps that provider): to the customer's email, from `Billa <onboarding@resend.dev>` for now, subject naming the document type/number/business, a short plain body, the PDF as an attachment.
6. 502 `email_send_failed` if Resend reports a failure — the document isn't marked as sent.
7. On success, set `sentAt` to now and return it.

## Frontend

`DocumentView.tsx` (the only page that needs to change) gets a new button next to "Download PDF", visible only when the document is finalized:

- If the customer has no email: the button is disabled, with a small hint ("Add an email to this customer to send it") instead of a click handler.
- Otherwise: "Send by email" (or "Resend" if `sentAt` is already set). Clicking shows a loading state, then either an inline success message with the sent date, or an inline error message on failure — matching the existing `apiError` banner pattern already used for the convert-to-invoice action on this same page.
- If `sentAt` is set, a small "Sent {date}" note appears near the button regardless of whether it's just been sent or was sent in a previous visit.

## What doesn't change

`GET /documents/:id`'s response gains `customer.email` (needed so the UI can tell whether the button should be disabled) — the only shape change to an existing endpoint. Everything else (PDF generation, download, finalize, convert) is untouched.

## Testing

Server: `documents.send.test.ts` covering a successful send (asserts the email helper was called with the right recipient/subject and that `sentAt` is set), 409 on a draft, 400 when the customer has no email, 502 when the email provider fails (and that `sentAt` stays null), 404 for another business's document, 401 without a session. The PDF renderer and the Resend wrapper are both mocked, matching how `documents.pdf.test.ts` already mocks `renderDocumentPdf` for speed.

Client: extend `DocumentView.test.tsx` to cover the button being disabled with a hint when the customer has no email, a successful send showing the sent confirmation, and an error banner on failure.
