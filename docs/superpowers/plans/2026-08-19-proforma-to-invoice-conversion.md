# Proforma-to-Invoice Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a finalized proforma invoice be converted, in one action, into a new draft invoice with the same customer, lines, and notes, using the `convertedFromId`/`convertedTo` self-relation already present on `Document`.

**Architecture:** A single new sub-resource route, `POST /documents/:id/convert`, that creates a new document the same way `POST /documents` already does, then two small client-side additions that surface the relation both directions: a "Convert to invoice" action on a proforma's read-only view, and a "Converted from proforma" link wherever the resulting invoice is shown.

**Tech Stack:** Existing Express/Prisma server, existing React/Vite client, no new dependencies, no schema changes (the relation already exists).

Reference: `docs/superpowers/specs/2026-08-19-proforma-to-invoice-conversion-design.md`

---

### Task 1: `POST /documents/:id/convert`

**Files:**
- Modify: `server/src/routes/documents.ts`
- Test: `server/src/routes/documents.convert.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/routes/documents.convert.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/register").send({
    email: "owner@example.com",
    password: "Supersecret1!",
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[]) {
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Musanze Supplies" });
  return res.body.customer.id as string;
}

async function createFinalizedProforma(app: ReturnType<typeof createApp>, cookies: string[], customerId: string) {
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "PROFORMA",
      customerId,
      issueDate: "2026-08-01",
      notes: "Payment due on delivery",
      lines: [{ description: "Printing", quantity: 2, unitPrice: 5000, taxRate: 18 }],
    });
  const id = created.body.document.id as string;
  await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
  return id;
}

describe("POST /documents/:id/convert", () => {
  it("creates a draft invoice copying the proforma's customer, lines, and notes", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const proformaId = await createFinalizedProforma(app, cookies, customerId);

    const res = await request(app).post(`/documents/${proformaId}/convert`).set("Cookie", cookies);

    expect(res.status).toBe(201);
    expect(res.body.document.type).toBe("INVOICE");
    expect(res.body.document.status).toBe("DRAFT");
    expect(res.body.document.number).toBeNull();
    expect(res.body.document.customer.name).toBe("Musanze Supplies");
    expect(res.body.document.notes).toBe("Payment due on delivery");
    expect(res.body.document.lines).toHaveLength(1);
    expect(res.body.document.lines[0].description).toBe("Printing");
    expect(res.body.document.subtotal).toBe(10000);
    expect(res.body.document.taxTotal).toBe(1800);
    expect(res.body.document.total).toBe(11800);
    expect(res.body.document.convertedFrom.id).toBe(proformaId);
  });

  it("sets the invoice's issue date to today, not the proforma's issue date", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const proformaId = await createFinalizedProforma(app, cookies, customerId);

    const res = await request(app).post(`/documents/${proformaId}/convert`).set("Cookie", cookies);

    const today = new Date().toISOString().slice(0, 10);
    expect(res.body.document.issueDate.slice(0, 10)).toBe(today);
  });

  it("links the proforma to the new invoice via convertedTo", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const proformaId = await createFinalizedProforma(app, cookies, customerId);

    const convertRes = await request(app).post(`/documents/${proformaId}/convert`).set("Cookie", cookies);
    const proformaRes = await request(app).get(`/documents/${proformaId}`).set("Cookie", cookies);

    expect(proformaRes.body.document.convertedTo.id).toBe(convertRes.body.document.id);
  });

  it("rejects converting a draft proforma", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "PROFORMA", customerId, issueDate: "2026-08-01", lines: [] });

    const res = await request(app).post(`/documents/${created.body.document.id}/convert`).set("Cookie", cookies);
    expect(res.status).toBe(409);
  });

  it("rejects converting a non-proforma document", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId,
        issueDate: "2026-08-01",
        lines: [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }],
      });
    await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);

    const res = await request(app).post(`/documents/${created.body.document.id}/convert`).set("Cookie", cookies);
    expect(res.status).toBe(400);
  });

  it("rejects converting the same proforma twice", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const proformaId = await createFinalizedProforma(app, cookies, customerId);
    await request(app).post(`/documents/${proformaId}/convert`).set("Cookie", cookies);

    const res = await request(app).post(`/documents/${proformaId}/convert`).set("Cookie", cookies);
    expect(res.status).toBe(409);
  });

  it("returns 404 for a proforma belonging to another business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const proformaId = await createFinalizedProforma(app, cookies, customerId);

    const otherCookies = await request(app).post("/auth/register").send({
      email: "other@example.com",
      password: "Supersecret1!",
      businessName: "Other Biz",
    });

    const res = await request(app)
      .post(`/documents/${proformaId}/convert`)
      .set("Cookie", otherCookies.headers["set-cookie"] as unknown as string[]);
    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/documents/x/convert");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/routes/documents.convert.test.ts`
Expected: FAIL, every request gets a 404 (the route doesn't exist yet).

- [ ] **Step 3: Extend `DOCUMENT_INCLUDE` with both sides of the relation**

In `server/src/routes/documents.ts`, change:

```ts
const DOCUMENT_INCLUDE = {
  lines: { orderBy: { sortOrder: "asc" as const } },
  customer: { select: { name: true } },
};
```

to:

```ts
const DOCUMENT_INCLUDE = {
  lines: { orderBy: { sortOrder: "asc" as const } },
  customer: { select: { name: true } },
  convertedFrom: { select: { id: true, number: true, type: true } },
  convertedTo: { select: { id: true, number: true, type: true } },
};
```

- [ ] **Step 4: Add the route**

In `server/src/routes/documents.ts`, add the route after `POST /:id/finalize` and before `DELETE /:id`:

```ts
documentsRouter.post("/:id/convert", async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const proforma = await prisma.document.findFirst({
    where: { id, businessId },
    include: { lines: true, convertedTo: { select: { id: true } } },
  });
  if (!proforma) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (proforma.type !== "PROFORMA") {
    res.status(400).json({ error: "not_a_proforma" });
    return;
  }
  if (proforma.status !== "FINALIZED") {
    res.status(409).json({ error: "not_finalized" });
    return;
  }
  if (proforma.convertedTo) {
    res.status(409).json({ error: "already_converted" });
    return;
  }

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  const totals = calculateDocumentTotals(
    proforma.lines.map((line) => ({
      quantity: Number(line.quantity),
      unitPrice: line.unitPrice,
      taxRate: Number(line.taxRate),
    })),
  );

  const invoice = await prisma.document.create({
    data: {
      businessId,
      type: "INVOICE",
      status: "DRAFT",
      template: business!.defaultTemplate,
      customerId: proforma.customerId,
      issueDate: new Date(new Date().toISOString().slice(0, 10)),
      notes: proforma.notes,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      convertedFromId: proforma.id,
      lines: {
        create: proforma.lines.map((line, index) => ({
          itemId: line.itemId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRate: line.taxRate,
          lineTotal: totals.lines[index].lineTotal,
          sortOrder: index,
        })),
      },
    },
    include: DOCUMENT_INCLUDE,
  });

  res.status(201).json({ document: invoice });
});
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `cd server && npx vitest run src/routes/documents.convert.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Run the full server suite and typecheck**

Run: `cd server && npm test && npm run typecheck`
Expected: all pass, no type errors. (`DOCUMENT_INCLUDE` now returns two extra always-present fields on every document response; no existing test asserts on the full response shape, so nothing else should break.)

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/documents.ts server/src/routes/documents.convert.test.ts
git commit -m "add POST /documents/:id/convert to turn a finalized proforma into a draft invoice"
```

---

### Task 2: `DocumentView` shows the conversion action and both cross-links

**Files:**
- Modify: `client/src/pages/DocumentView.tsx`
- Modify: `client/src/pages/DocumentView.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `client/src/pages/DocumentView.test.tsx`, add the following to the top-level imports (the file already imports `render`, `screen`, `MemoryRouter`, `Route`, `Routes`, `afterEach`, `describe`, `expect`, `it`, `vi`, `AuthProvider`, `DocumentView`; add `waitFor` and `userEvent` if not already present):

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
```

Add a `urlOf` helper if the file doesn't already have one (it doesn't yet):

```tsx
function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}
```

Add three tests to the `describe("DocumentView"` block:

```tsx
it("converts a finalized proforma to a draft invoice", async () => {
  vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = urlOf(input);
    if (url.endsWith("/documents/d1/convert") && init?.method === "POST") {
      return new Response(JSON.stringify({ document: { id: "new-invoice-id" } }), { status: 201 });
    }
    if (url.endsWith("/documents/d1")) {
      return new Response(
        JSON.stringify({
          document: {
            id: "d1",
            type: "PROFORMA",
            number: "PRO-0001",
            status: "FINALIZED",
            customer: { name: "Kigali Traders" },
            lines: [],
            subtotal: 0,
            taxTotal: 0,
            total: 0,
            convertedFrom: null,
            convertedTo: null,
          },
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 401 });
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const user = userEvent.setup();

  render(
    <MemoryRouter initialEntries={["/documents/d1"]}>
      <AuthProvider>
        <Routes>
          <Route path="/documents/:id" element={<DocumentView />} />
          <Route path="/documents/:id/edit" element={<div>edit invoice page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

  await user.click(await screen.findByRole("button", { name: /convert to invoice/i }));

  await waitFor(() => expect(screen.getByText("edit invoice page")).toBeInTheDocument());
});

it("shows a link instead of a button once the proforma has already been converted", async () => {
  vi.spyOn(global, "fetch").mockImplementation(async () =>
    new Response(
      JSON.stringify({
        document: {
          id: "d1",
          type: "PROFORMA",
          number: "PRO-0001",
          status: "FINALIZED",
          customer: { name: "Kigali Traders" },
          lines: [],
          subtotal: 0,
          taxTotal: 0,
          total: 0,
          convertedFrom: null,
          convertedTo: { id: "inv1", number: "INV-0005" },
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

  expect(await screen.findByText(/converted to invoice inv-0005/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /convert to invoice/i })).not.toBeInTheDocument();
});

it("shows a Converted from proforma link on an invoice created via conversion", async () => {
  vi.spyOn(global, "fetch").mockImplementation(async () =>
    new Response(
      JSON.stringify({
        document: {
          id: "inv1",
          type: "INVOICE",
          number: null,
          status: "DRAFT",
          customer: { name: "Kigali Traders" },
          lines: [],
          subtotal: 0,
          taxTotal: 0,
          total: 0,
          convertedFrom: { id: "d1", number: "PRO-0001" },
          convertedTo: null,
        },
      }),
      { status: 200 },
    ),
  );

  render(
    <MemoryRouter initialEntries={["/documents/inv1"]}>
      <AuthProvider>
        <Routes>
          <Route path="/documents/:id" element={<DocumentView />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

  expect(await screen.findByText(/converted from proforma pro-0001/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/DocumentView.test.tsx`
Expected: FAIL on all three new tests (no such button/link exists yet).

- [ ] **Step 3: Write the implementation**

Replace the full contents of `client/src/pages/DocumentView.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { DocumentType } from "@billa/shared";
import { AppLayout } from "../components/AppLayout";
import { apiRequest, ApiError, API_BASE_URL } from "../lib/apiClient";
import { formatRwf } from "@billa/shared";

interface DocumentLine {
  id: string;
  description: string;
  quantity: string | number;
  unitPrice: number;
  lineTotal: number;
}

interface DocumentLink {
  id: string;
  number: string | null;
}

interface DocumentDetail {
  id: string;
  type: DocumentType;
  number: string | null;
  status: "DRAFT" | "FINALIZED";
  customer: { name: string };
  lines: DocumentLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  convertedFrom: DocumentLink | null;
  convertedTo: DocumentLink | null;
}

export default function DocumentView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  useEffect(() => {
    apiRequest<{ document: DocumentDetail }>(`/documents/${id}`).then((data) => setDocument(data.document));
  }, [id]);

  async function handleConvert() {
    if (!document) return;
    if (!window.confirm("Convert this proforma to an invoice? This can't be undone.")) {
      return;
    }
    setApiError(null);
    setIsConverting(true);
    try {
      const response = await apiRequest<{ document: { id: string } }>(`/documents/${document.id}/convert`, {
        method: "POST",
      });
      navigate(`/documents/${response.document.id}/edit`);
    } catch (err) {
      setApiError(
        err instanceof ApiError ? "Couldn't convert this document. Try again." : "Something went wrong. Try again.",
      );
    } finally {
      setIsConverting(false);
    }
  }

  if (!document) {
    return (
      <AppLayout>
        <p className="font-sans text-sm text-neutral-600">Loading…</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-neutral-900">{document.number ?? "Draft"}</h1>
          <div className="flex items-center gap-4">
            <span className="font-sans text-sm text-neutral-500">{document.status}</span>
            {document.type === "PROFORMA" &&
              document.status === "FINALIZED" &&
              (document.convertedTo ? (
                <Link
                  to={`/documents/${document.convertedTo.id}`}
                  className="font-sans text-sm text-primary-500 hover:text-primary-700"
                >
                  Converted to invoice {document.convertedTo.number ?? "Draft"}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={isConverting}
                  onClick={handleConvert}
                  className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isConverting ? "Converting…" : "Convert to invoice"}
                </button>
              ))}
            <button
              type="button"
              onClick={() => window.open(`${API_BASE_URL}/documents/${document.id}/pdf`, "_blank")}
              className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Download PDF
            </button>
          </div>
        </div>

        {apiError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {apiError}
          </div>
        )}

        <p className="font-sans text-sm text-neutral-600">{document.customer.name}</p>
        {document.type === "INVOICE" && document.convertedFrom && (
          <Link
            to={`/documents/${document.convertedFrom.id}`}
            className="-mt-4 font-sans text-sm text-primary-500 hover:text-primary-700"
          >
            Converted from proforma {document.convertedFrom.number ?? "Draft"}
          </Link>
        )}
        <table className="w-full border-collapse font-sans text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2">Description</th>
              <th className="py-2">Quantity</th>
              <th className="py-2">Unit price</th>
              <th className="py-2">Line total</th>
            </tr>
          </thead>
          <tbody>
            {document.lines.map((line) => (
              <tr key={line.id} className="border-b border-neutral-100">
                <td className="py-2">{line.description}</td>
                <td className="py-2">{line.quantity}</td>
                <td className="py-2">{formatRwf(line.unitPrice)}</td>
                <td className="py-2">{formatRwf(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-col items-end gap-1 font-sans text-sm text-neutral-600">
          <span>Subtotal: {formatRwf(document.subtotal)}</span>
          <span>Tax: {formatRwf(document.taxTotal)}</span>
          <span className="font-semibold text-neutral-900">Total: {formatRwf(document.total)}</span>
        </div>
      </div>
    </AppLayout>
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd client && npx vitest run src/pages/DocumentView.test.tsx`
Expected: PASS, 5 tests (the 2 pre-existing tests plus the 3 new ones).

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/DocumentView.tsx client/src/pages/DocumentView.test.tsx
git commit -m "add Convert to invoice action and conversion cross-links to DocumentView"
```

---

### Task 3: `DocumentForm` shows the "Converted from proforma" link

**Files:**
- Modify: `client/src/pages/DocumentForm.tsx`
- Modify: `client/src/pages/DocumentForm.test.tsx`

A converted invoice starts as a draft, so the first place a user sees it is the edit form, not the read-only view. Without this, the connection to the source proforma would be invisible until the invoice is finalized.

- [ ] **Step 1: Write the failing test**

In `client/src/pages/DocumentForm.test.tsx`, add to the `describe("DocumentForm"` block:

```tsx
it("shows a Converted from proforma link when editing a converted invoice", async () => {
  vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = urlOf(input);
    if (url.endsWith("/documents/d1")) {
      return new Response(
        JSON.stringify({
          document: {
            id: "d1",
            customerId: "c1",
            customer: { name: "Kigali Traders" },
            issueDate: "2026-08-19T00:00:00.000Z",
            dueDate: null,
            notes: null,
            lines: [],
            convertedFrom: { id: "proforma1", number: "PRO-0001" },
          },
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 401 });
  });

  renderEdit("d1");

  expect(await screen.findByText(/converted from proforma pro-0001/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/DocumentForm.test.tsx`
Expected: FAIL, no such text exists yet.

- [ ] **Step 3: Write the implementation**

In `client/src/pages/DocumentForm.tsx`, change the `react-router-dom` import:

```ts
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
```

to:

```ts
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
```

Add a field to the `DocumentResponse` interface:

```ts
interface DocumentResponse {
  id: string;
  customerId: string;
  customer: { name: string };
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  lines: DocumentLineResponse[];
  convertedFrom: { id: string; number: string | null } | null;
}
```

Add a new piece of state right after the existing `isLoaded` state:

```ts
const [isLoaded, setIsLoaded] = useState(!isEditing);
const [convertedFrom, setConvertedFrom] = useState<{ id: string; number: string | null } | null>(null);
```

In the `useEffect` that loads an existing document, set it alongside `reset(...)`:

```ts
useEffect(() => {
  if (!isEditing) return;
  apiRequest<{ document: DocumentResponse }>(`/documents/${id}`).then((data) => {
    const doc = data.document;
    reset({
      customerId: doc.customerId,
      customerName: doc.customer.name,
      issueDate: doc.issueDate.slice(0, 10),
      dueDate: doc.dueDate ? doc.dueDate.slice(0, 10) : "",
      notes: doc.notes ?? "",
      lines: doc.lines.map((line) => ({
        itemId: line.itemId ?? undefined,
        description: line.description,
        quantity: Number(line.quantity),
        unitPrice: line.unitPrice,
        taxRate: Number(line.taxRate),
      })),
    });
    setConvertedFrom(doc.convertedFrom ?? null);
    setIsLoaded(true);
  });
}, [id, isEditing, reset]);
```

In the JSX, add the link right after the `<h1>` heading:

```tsx
<h1 className="font-display text-2xl font-semibold text-neutral-900">
  {isEditing ? `Edit ${labels.singular}` : `New ${labels.singular}`}
</h1>

{convertedFrom && (
  <Link to={`/documents/${convertedFrom.id}`} className="font-sans text-sm text-primary-500 hover:text-primary-700">
    Converted from proforma {convertedFrom.number ?? "Draft"}
  </Link>
)}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd client && npx vitest run src/pages/DocumentForm.test.tsx`
Expected: PASS, 8 tests (the 7 pre-existing tests plus this new one).

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/DocumentForm.tsx client/src/pages/DocumentForm.test.tsx
git commit -m "show a Converted from proforma link when editing a converted invoice"
```

---

### Task 4: Full suite, typecheck, and real-browser verification

**Files:** none (verification only)

- [ ] **Step 1: Run every workspace's test suite**

Run: `cd shared && npm test && cd ../server && npm test && cd ../client && npm test`
Expected: all pass.

- [ ] **Step 2: Typecheck every workspace**

Run: `cd shared && npm run typecheck && cd ../server && npm run typecheck && cd ../client && npm run typecheck`
Expected: no errors in any workspace.

- [ ] **Step 3: Real-browser verification**

Start both the API server and the client dev server, log in to an existing test account, then:

1. Create a new proforma invoice with a customer and one line item. Save as a draft.
2. Confirm the read-only view of a *draft* proforma shows neither a "Convert to invoice" button nor a "Converted to invoice" link (conversion is only for finalized proformas).
3. Finalize the proforma. Confirm its read-only view now shows a "Convert to invoice" button.
4. Click it, accept the confirmation, and confirm it navigates to a new draft invoice's edit page.
5. On that edit page, confirm a "Converted from proforma {number}" link appears, and that clicking it navigates back to the proforma's view.
6. Confirm the new invoice's customer, line items, and notes match the proforma, and that its issue date is today's date rather than the proforma's original issue date.
7. Finalize the new invoice. Confirm the "Converted from proforma" link still appears on its (now read-only) view.
8. Go back to the proforma's view. Confirm the button is now replaced by a "Converted to invoice {number}" link, and that clicking it navigates to the invoice.
9. Attempt to convert the same proforma again via a direct API call (`POST /documents/:id/convert`) and confirm it returns 409.
10. Check the browser's console and network tab for unexpected errors during all of the above.

- [ ] **Step 4: Fix any issues found**

If real-browser verification finds bugs, fix them, add or update the relevant test(s) to cover what was missed, re-run that test file to confirm it passes, then commit the fix as its own commit.

- [ ] **Step 5: Final confirmation**

Once every workspace's suite passes, every workspace typechecks, and manual verification found no outstanding issues, this stage is done.

---

## Self-review notes

- **Spec coverage:** the endpoint's four gating conditions (Task 1), copied vs. recomputed vs. fresh fields (Task 1, Step 4), the `DOCUMENT_INCLUDE` extension (Task 1, Step 3), the proforma-side button/link (Task 2), the invoice-side link on both `DocumentForm` and `DocumentView` (Tasks 2 and 3), and the confirm-guard on the action (Task 2) are all covered by a task.
- **Placeholder scan:** no TBD/TODO; every step shows real code or an exact command.
- **Type consistency:** `DocumentLink` (Task 2) and the inline `{ id: string; number: string | null } | null` shape used for `convertedFrom` in `DocumentForm` (Task 3) describe the same server response shape (`{ id, number, type }` trimmed to what each component needs) produced by the `DOCUMENT_INCLUDE` change in Task 1; the route's success/error status codes (404/400/409/201) match exactly what the Task 1 tests assert.
