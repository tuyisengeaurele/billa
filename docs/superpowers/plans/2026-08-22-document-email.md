# Document Emailing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a business email a finalized document's PDF straight to its customer via Resend, and remember when it was last sent.

**Architecture:** One new nullable column (`Document.sentAt`), one new thin provider wrapper (`lib/resend.ts`, mirroring how `lib/flutterwave.ts` wraps that provider), one new route (`POST /documents/:id/send`) that reuses the exact same PDF-rendering pipeline the existing download route already uses, and one new button on `DocumentView.tsx`.

**Tech Stack:** Express, Prisma, Resend (new dependency), React, Vitest, React Testing Library.

---

### Task 1: Schema migration and the Resend wrapper

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_document_sent_at/migration.sql`
- Modify: `server/src/lib/pdf/render-data.test.ts`
- Create: `server/src/lib/resend.ts`
- Modify: `server/package.json` (adds `resend`)
- Modify: `server/.env.example`

- [ ] **Step 1: Add the column**

In `server/prisma/schema.prisma`, add one field to the `Document` model (anywhere among its scalar fields, e.g. right after `notes`):

```prisma
  sentAt      DateTime?
```

- [ ] **Step 2: Apply the migration**

```bash
cd server
DEV_URL="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/^"//;s/"$//')"
TEST_URL="$(grep -m1 '^DATABASE_URL=' .env.test | cut -d= -f2- | sed 's/^"//;s/"$//')"
npx prisma migrate diff --from-url "$DEV_URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/diff.sql
STAMP=$(date +%Y%m%d%H%M%S)
mkdir -p "prisma/migrations/${STAMP}_document_sent_at"
mv prisma/migrations/diff.sql "prisma/migrations/${STAMP}_document_sent_at/migration.sql"
DATABASE_URL="$DEV_URL" npx prisma migrate deploy
DATABASE_URL="$TEST_URL" npx prisma migrate deploy
npx prisma generate
```

This is a pure column addition (nullable, no data-loss risk), so unlike earlier migrations in this project it doesn't need a database reset first — `migrate diff` against the live schema is sufficient. If `prisma generate` fails with a Windows `EPERM` error, stop the running dev server first and retry.

- [ ] **Step 3: Fix the fixture this change breaks**

In `server/src/lib/pdf/render-data.test.ts`, the `makeDocument()` fixture is typed against the real `Document` type. Find it and add `sentAt: null,` alongside its other scalar fields (next to `notes` or similar).

- [ ] **Step 4: Install Resend and write the wrapper**

Run: `cd server && npm install resend`

Create `server/src/lib/resend.ts`:

```ts
import { Resend } from "resend";

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set");
    client = new Resend(apiKey);
  }
  return client;
}

export interface SendDocumentEmailInput {
  to: string;
  subject: string;
  html: string;
  attachmentFilename: string;
  attachmentBuffer: Buffer;
}

export async function sendDocumentEmail(input: SendDocumentEmailInput): Promise<void> {
  const { error } = await getClient().emails.send({
    from: "Billa <onboarding@resend.dev>",
    to: [input.to],
    subject: input.subject,
    html: input.html,
    attachments: [{ filename: input.attachmentFilename, content: input.attachmentBuffer }],
  });
  if (error) {
    throw new Error(error.message ?? "resend_send_failed");
  }
}
```

- [ ] **Step 5: Document the env var**

Append to `server/.env.example`:

```
# Resend (transactional email for sending documents to customers)
RESEND_API_KEY="re_your_test_api_key"
```

- [ ] **Step 6: Run the server suite and typecheck to confirm nothing broke**

Run: `cd server && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations server/src/lib/pdf/render-data.test.ts server/src/lib/resend.ts server/package.json server/.env.example
git commit -m "add sentAt to documents and a Resend email wrapper"
```

---

### Task 2: `POST /documents/:id/send`

**Files:**
- Modify: `server/src/routes/documents.ts`
- Create: `server/src/routes/documents.send.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/routes/documents.send.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";
import * as renderDocumentPdfModule from "../lib/pdf/render-document-pdf.js";
import * as resendModule from "../lib/resend.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[], email?: string) {
  const res = await request(app)
    .post("/customers")
    .set("Cookie", cookies)
    .send({ name: "Acme Ltd", ...(email ? { email } : {}) });
  return res.body.customer.id as string;
}

async function createFinalizedInvoice(app: ReturnType<typeof createApp>, cookies: string[], customerId: string) {
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-18",
      lines: [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }],
    });
  await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);
  return created.body.document.id as string;
}

describe("POST /documents/:id/send", () => {
  beforeEach(() => {
    vi.spyOn(renderDocumentPdfModule, "renderDocumentPdf").mockResolvedValue(Buffer.from("%PDF-fake"));
  });

  it("emails the document and records sentAt", async () => {
    const sendSpy = vi.spyOn(resendModule, "sendDocumentEmail").mockResolvedValue();
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, "acme@example.com");
    const documentId = await createFinalizedInvoice(app, cookies, customerId);

    const res = await request(app).post(`/documents/${documentId}/send`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.sentAt).not.toBeNull();
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: "acme@example.com", attachmentFilename: "INV-0001.pdf" }),
    );
  });

  it("returns 409 when the document is still a draft", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, "acme@example.com");
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "INVOICE", customerId, issueDate: "2026-08-18", lines: [] });

    const res = await request(app).post(`/documents/${created.body.document.id}/send`).set("Cookie", cookies);

    expect(res.status).toBe(409);
  });

  it("returns 400 when the customer has no email on file", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const documentId = await createFinalizedInvoice(app, cookies, customerId);

    const res = await request(app).post(`/documents/${documentId}/send`).set("Cookie", cookies);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("customer_has_no_email");
  });

  it("returns 502 and does not set sentAt when the email provider fails", async () => {
    vi.spyOn(resendModule, "sendDocumentEmail").mockRejectedValue(new Error("provider down"));
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, "acme@example.com");
    const documentId = await createFinalizedInvoice(app, cookies, customerId);

    const res = await request(app).post(`/documents/${documentId}/send`).set("Cookie", cookies);

    expect(res.status).toBe(502);

    const getRes = await request(app).get(`/documents/${documentId}`).set("Cookie", cookies);
    expect(getRes.body.document.sentAt).toBeNull();
  });

  it("returns 404 for a document belonging to another business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, "acme@example.com");
    const documentId = await createFinalizedInvoice(app, cookies, customerId);

    const otherRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Biz",
    });

    const res = await request(app)
      .post(`/documents/${documentId}/send`)
      .set("Cookie", otherRes.headers["set-cookie"] as unknown as string[]);

    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/documents/some-id/send");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/routes/documents.send.test.ts`
Expected: FAIL — the route doesn't exist yet.

- [ ] **Step 3: Add `email` to the customer include and write the route**

In `server/src/routes/documents.ts`, change the shared `DOCUMENT_INCLUDE` constant's customer select:

```ts
  customer: { select: { name: true } },
```

to:

```ts
  customer: { select: { name: true, email: true } },
```

Add these imports near the top of the file, alongside the existing `renderDocumentPdf`/`buildPdfRenderData` imports:

```ts
import { sendDocumentEmail } from "../lib/resend.js";
```

Add this route (placed after the existing `GET /:id/pdf` route):

```ts
const DOCUMENT_TYPE_DISPLAY: Record<string, string> = {
  INVOICE: "Invoice",
  PROFORMA: "Proforma invoice",
  DELIVERY_NOTE: "Delivery note",
  QUOTE: "Quote",
  RECEIPT: "Receipt",
};

documentsRouter.post("/:id/send", async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const document = await prisma.document.findFirst({
    where: { id, businessId },
    include: { lines: { orderBy: { sortOrder: "asc" } }, customer: true },
  });
  if (!document) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (document.status !== "FINALIZED") {
    res.status(409).json({ error: "not_finalized" });
    return;
  }
  if (!document.customer.email) {
    res.status(400).json({ error: "customer_has_no_email" });
    return;
  }

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  const data = await buildPdfRenderData(document, business!);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderDocumentPdf(document.template, data);
  } catch {
    res.status(500).json({ error: "pdf_render_failed" });
    return;
  }

  const typeLabel = DOCUMENT_TYPE_DISPLAY[document.type];
  const filename = document.number ? `${document.number}.pdf` : `Draft-${document.id.slice(0, 8)}.pdf`;

  try {
    await sendDocumentEmail({
      to: document.customer.email,
      subject: `${typeLabel} ${document.number} from ${business!.name}`,
      html: `<p>Hello ${document.customer.name},</p><p>Please find your ${typeLabel.toLowerCase()} ${document.number} from ${business!.name} attached.</p>`,
      attachmentFilename: filename,
      attachmentBuffer: pdfBuffer,
    });
  } catch {
    res.status(502).json({ error: "email_send_failed" });
    return;
  }

  const updated = await prisma.document.update({ where: { id }, data: { sentAt: new Date() } });
  res.json({ sentAt: updated.sentAt });
});
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `cd server && npx vitest run src/routes/documents.send.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Run the full server suite and typecheck**

Run: `cd server && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/documents.ts server/src/routes/documents.send.test.ts
git commit -m "add POST /documents/:id/send to email a finalized document to its customer"
```

---

### Task 3: Client — Send by email button

**Files:**
- Modify: `client/src/pages/DocumentView.tsx`
- Modify: `client/src/pages/DocumentView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add these tests inside the existing `describe("DocumentView", ...)` block in `client/src/pages/DocumentView.test.tsx`, right before the closing `});`:

```tsx
  it("disables the send button and shows a hint when the customer has no email", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          document: {
            id: "d1",
            number: "INV-0001",
            status: "FINALIZED",
            customer: { name: "Kigali Traders", email: null },
            sentAt: null,
            lines: [],
            subtotal: 0,
            taxTotal: 0,
            total: 0,
          },
        }),
        { status: 200 },
      ),
    );

    render(
      <MemoryRouter initialEntries={["/documents/d1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents/:id" element={<DocumentView />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: /send by email/i })).toBeDisabled();
  });

  it("sends the document by email and shows a sent confirmation", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/documents/d1/send") && init?.method === "POST") {
        return new Response(JSON.stringify({ sentAt: "2026-08-22T10:00:00.000Z" }), { status: 200 });
      }
      if (url.endsWith("/documents/d1")) {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              number: "INV-0001",
              status: "FINALIZED",
              customer: { name: "Kigali Traders", email: "owner@acme.test" },
              sentAt: null,
              lines: [],
              subtotal: 0,
              taxTotal: 0,
              total: 0,
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/documents/d1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents/:id" element={<DocumentView />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /send by email/i }));

    expect(await screen.findByText(/sent to owner@acme.test/i)).toBeInTheDocument();
  });

  it("shows an error message when sending fails", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/documents/d1/send") && init?.method === "POST") {
        return new Response(JSON.stringify({ error: "email_send_failed" }), { status: 502 });
      }
      if (url.endsWith("/documents/d1")) {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              number: "INV-0001",
              status: "FINALIZED",
              customer: { name: "Kigali Traders", email: "owner@acme.test" },
              sentAt: null,
              lines: [],
              subtotal: 0,
              taxTotal: 0,
              total: 0,
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/documents/d1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents/:id" element={<DocumentView />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /send by email/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't send this document/i);
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/DocumentView.test.tsx`
Expected: FAIL on the 3 new tests — there's no send button yet.

- [ ] **Step 3: Add the button**

In `client/src/pages/DocumentView.tsx`, update the `DocumentDetail` interface:

```ts
interface DocumentDetail {
  id: string;
  type: DocumentType;
  number: string | null;
  status: "DRAFT" | "FINALIZED";
  customer: { name: string; email: string | null };
  sentAt: string | null;
  lines: DocumentLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  convertedFrom: DocumentLink | null;
  convertedTo: DocumentLink | null;
}
```

Add state alongside the existing `isConverting`/`apiError` state:

```ts
  const [isSending, setIsSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
```

Add this function alongside `handleConvert`:

```ts
  async function handleSend() {
    if (!document || !document.customer.email) return;
    setApiError(null);
    setSendMessage(null);
    setIsSending(true);
    try {
      const response = await apiRequest<{ sentAt: string }>(`/documents/${document.id}/send`, { method: "POST" });
      setDocument({ ...document, sentAt: response.sentAt });
      setSendMessage(`Sent to ${document.customer.email}`);
    } catch (err) {
      setApiError(
        err instanceof ApiError ? "Couldn't send this document. Try again." : "Something went wrong. Try again.",
      );
    } finally {
      setIsSending(false);
    }
  }
```

Replace:

```tsx
            <button
              type="button"
              onClick={() => window.open(`${API_BASE_URL}/documents/${document.id}/pdf`, "_blank")}
              className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Download PDF
            </button>
          </div>
        </div>
```

with:

```tsx
            <button
              type="button"
              onClick={() => window.open(`${API_BASE_URL}/documents/${document.id}/pdf`, "_blank")}
              className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Download PDF
            </button>
            {document.status === "FINALIZED" && (
              <button
                type="button"
                disabled={isSending || !document.customer.email}
                onClick={handleSend}
                title={!document.customer.email ? "Add an email to this customer to send it" : undefined}
                className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSending ? "Sending…" : document.sentAt ? "Resend" : "Send by email"}
              </button>
            )}
          </div>
        </div>

        {sendMessage && (
          <div className="rounded-lg bg-success-bg px-4 py-3 font-sans text-sm text-success" role="status">
            {sendMessage}
          </div>
        )}
        {document.sentAt && !sendMessage && (
          <p className="font-sans text-xs text-neutral-400">Sent {document.sentAt.slice(0, 10)}</p>
        )}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `cd client && npx vitest run src/pages/DocumentView.test.tsx`
Expected: PASS, all 8 tests (5 existing + 3 new).

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/DocumentView.tsx client/src/pages/DocumentView.test.tsx
git commit -m "add a Send by email button to finalized documents"
```

---

### Task 4: Real-world verification

**Files:** none (verification only)

- [ ] **Step 1: Add an email to a real customer**

With the dev servers running, open Settings or Customers and set the email on a test customer to your own Resend account email (the sandbox address can only deliver there without a verified domain).

- [ ] **Step 2: Send a real document**

Finalize an invoice for that customer, click "Send by email", and confirm the email actually arrives in your inbox with the PDF attached and correct subject line.

- [ ] **Step 3: Check the disabled state**

Confirm a customer with no email shows the button disabled with the hint tooltip, and that re-visiting a sent document shows "Sent {date}" and the button now reads "Resend".

- [ ] **Step 4: Fix any issues found**

If real-world verification finds bugs, fix them, add or update the relevant test(s), re-run that test file to confirm it passes, then commit the fix as its own commit.

- [ ] **Step 5: Final confirmation**

Once the full client and server suites pass, both typecheck clean, and a real email was confirmed delivered, this stage is done. Note for later: sending to real customer addresses (not just your own Resend account email) requires verifying a domain in the Resend dashboard.

---

## Self-review notes

- **Spec coverage:** the `sentAt` field and Resend wrapper (Task 1), the send endpoint with all its gating (finalized-only, customer-has-email, provider-failure handling) and reuse of the existing PDF pipeline (Task 2), and the button's three states (disabled with hint, ready to send/resend, sent confirmation) on `DocumentView.tsx` (Task 3) are all covered.
- **Placeholder scan:** no TBD/TODO; every step shows real code or an exact command, except Task 4's manual delivery-verification checklist, which is inherently something only a real inbox can confirm.
- **Type consistency:** `SendDocumentEmailInput` (Task 1) matches exactly what Task 2's route passes to `sendDocumentEmail`. `DocumentDetail`'s new `customer.email` and `sentAt` fields (Task 3) match exactly what Task 2's route now returns via the extended `DOCUMENT_INCLUDE`.
