# Remaining Document Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the other four document types (proforma, delivery note, quote, receipt) that the document engine and PDF pipeline already support generically, with type-aware copy where "invoice" language doesn't fit, plus a settings UI for the numbering sequences that already exist server-side.

**Architecture:** Two new shared label-lookup functions consumed by both the client form and the PDF templates, four new nav links, and a self-contained sequence-editor component wired to the existing (already-tested, unmodified) `/business/sequences` endpoints.

**Tech Stack:** Existing React/Vite client, existing Express/Prisma server, no new dependencies.

Reference: `docs/superpowers/specs/2026-08-19-remaining-document-types-design.md`

---

### Task 1: Shared document-label helpers

**Files:**
- Create: `shared/src/document-labels.ts`
- Create: `shared/src/document-labels.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/src/document-labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getDueDateLabel, getPartyLabel } from "./document-labels.js";

describe("getDueDateLabel", () => {
  it("returns 'Due date' for an invoice", () => {
    expect(getDueDateLabel("INVOICE")).toBe("Due date");
  });

  it("returns 'Valid until' for a proforma", () => {
    expect(getDueDateLabel("PROFORMA")).toBe("Valid until");
  });

  it("returns 'Valid until' for a quote", () => {
    expect(getDueDateLabel("QUOTE")).toBe("Valid until");
  });

  it("returns null for a delivery note", () => {
    expect(getDueDateLabel("DELIVERY_NOTE")).toBeNull();
  });

  it("returns null for a receipt", () => {
    expect(getDueDateLabel("RECEIPT")).toBeNull();
  });
});

describe("getPartyLabel", () => {
  it("returns 'Deliver to' for a delivery note", () => {
    expect(getPartyLabel("DELIVERY_NOTE")).toBe("Deliver to");
  });

  it("returns 'Bill to' for an invoice", () => {
    expect(getPartyLabel("INVOICE")).toBe("Bill to");
  });

  it("returns 'Bill to' for a proforma", () => {
    expect(getPartyLabel("PROFORMA")).toBe("Bill to");
  });

  it("returns 'Bill to' for a quote", () => {
    expect(getPartyLabel("QUOTE")).toBe("Bill to");
  });

  it("returns 'Bill to' for a receipt", () => {
    expect(getPartyLabel("RECEIPT")).toBe("Bill to");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd shared && npx vitest run src/document-labels.test.ts`
Expected: FAIL, `Cannot find module './document-labels.js'`.

- [ ] **Step 3: Write the implementation**

Create `shared/src/document-labels.ts`:

```ts
import type { DocumentType } from "./document-types.js";

export function getDueDateLabel(type: DocumentType): string | null {
  switch (type) {
    case "INVOICE":
      return "Due date";
    case "PROFORMA":
    case "QUOTE":
      return "Valid until";
    case "DELIVERY_NOTE":
    case "RECEIPT":
      return null;
  }
}

export function getPartyLabel(type: DocumentType): string {
  return type === "DELIVERY_NOTE" ? "Deliver to" : "Bill to";
}
```

- [ ] **Step 4: Export it from the shared package**

In `shared/src/index.ts`, add:

```ts
export * from "./document-labels.js";
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `cd shared && npx vitest run src/document-labels.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add shared/src/document-labels.ts shared/src/document-labels.test.ts shared/src/index.ts
git commit -m "add type-aware due-date and party label helpers"
```

---

### Task 2: `PdfRenderData` gains `partyLabel` and `dueDateLabel`

**Files:**
- Modify: `server/src/lib/pdf/render-data.ts`
- Modify: `server/src/lib/pdf/render-data.test.ts`
- Modify: `server/src/lib/pdf/minimal-template.test.ts`
- Modify: `server/src/lib/pdf/formal-template.test.ts`
- Modify: `server/src/lib/pdf/sidebar-accent-template.test.ts`
- Modify: `server/src/lib/pdf/render-document-pdf.test.ts`

- [ ] **Step 1: Write the failing test**

In `server/src/lib/pdf/render-data.test.ts`, add to the `describe("buildPdfRenderData"` block:

```ts
it("computes the party label and hides the due date label for a delivery note", async () => {
  const data = await buildPdfRenderData(makeDocument({ type: "DELIVERY_NOTE" }), makeBusiness());
  expect(data.partyLabel).toBe("Deliver to");
  expect(data.dueDateLabel).toBeNull();
});

it("computes 'Valid until' as the due date label for a quote", async () => {
  const data = await buildPdfRenderData(makeDocument({ type: "QUOTE" }), makeBusiness());
  expect(data.dueDateLabel).toBe("Valid until");
  expect(data.partyLabel).toBe("Bill to");
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/lib/pdf/render-data.test.ts`
Expected: FAIL, `data.partyLabel` and `data.dueDateLabel` are `undefined`.

- [ ] **Step 3: Add the fields to the interface and compute them**

In `server/src/lib/pdf/render-data.ts`, change the import line:

```ts
import { formatRwf, getDueDateLabel, getPartyLabel } from "@billa/shared";
```

Add two fields to the `PdfRenderData` interface, right after `typeLabel: string;`:

```ts
  typeLabel: string;
  partyLabel: string;
  dueDateLabel: string | null;
```

In `buildPdfRenderData`'s returned object, add the same two fields right after `typeLabel: TYPE_LABELS[document.type],`:

```ts
    typeLabel: TYPE_LABELS[document.type],
    partyLabel: getPartyLabel(document.type),
    dueDateLabel: getDueDateLabel(document.type),
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd server && npx vitest run src/lib/pdf/render-data.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Update every test fixture that builds a `PdfRenderData` literal**

`PdfRenderData` now requires `partyLabel` and `dueDateLabel`. Four test files build one by hand; each needs two new fields added to its `makeData()` helper.

In `server/src/lib/pdf/minimal-template.test.ts`, in the `makeData()` function, add after `typeLabel: "Invoice",`:

```ts
    typeLabel: "Invoice",
    partyLabel: "Bill to",
    dueDateLabel: "Due date",
```

In `server/src/lib/pdf/formal-template.test.ts`, same change to its `makeData()`:

```ts
    typeLabel: "Invoice",
    partyLabel: "Bill to",
    dueDateLabel: "Due date",
```

In `server/src/lib/pdf/sidebar-accent-template.test.ts`, same change to its `makeData()`:

```ts
    typeLabel: "Invoice",
    partyLabel: "Bill to",
    dueDateLabel: "Due date",
```

In `server/src/lib/pdf/render-document-pdf.test.ts`, same change to its `makeData()`:

```ts
    typeLabel: "Invoice",
    partyLabel: "Bill to",
    dueDateLabel: "Due date",
```

- [ ] **Step 6: Run the full server suite and typecheck to confirm nothing broke**

Run: `cd server && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add server/src/lib/pdf/render-data.ts server/src/lib/pdf/render-data.test.ts server/src/lib/pdf/minimal-template.test.ts server/src/lib/pdf/formal-template.test.ts server/src/lib/pdf/sidebar-accent-template.test.ts server/src/lib/pdf/render-document-pdf.test.ts
git commit -m "add partyLabel and dueDateLabel to PdfRenderData"
```

---

### Task 3: MINIMAL template uses the dynamic party label

**Files:**
- Modify: `server/src/lib/pdf/minimal-template.ts`
- Modify: `server/src/lib/pdf/minimal-template.test.ts`

- [ ] **Step 1: Write the failing test**

In `server/src/lib/pdf/minimal-template.test.ts`, add to the `describe("renderMinimalHtml"` block:

```ts
it("uses the dynamic party label instead of a hardcoded one", () => {
  const html = renderMinimalHtml(makeData({ partyLabel: "Deliver to" }));
  expect(html).toContain("Deliver to");
  expect(html).not.toContain("Bill to");
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/lib/pdf/minimal-template.test.ts`
Expected: FAIL, output still contains the hardcoded "Bill to".

- [ ] **Step 3: Use the dynamic label**

In `server/src/lib/pdf/minimal-template.ts`, change:

```ts
        <div class="party-label">Bill to</div>
```

to:

```ts
        <div class="party-label">${data.partyLabel}</div>
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd server && npx vitest run src/lib/pdf/minimal-template.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/pdf/minimal-template.ts server/src/lib/pdf/minimal-template.test.ts
git commit -m "use the dynamic party label in the MINIMAL template"
```

---

### Task 4: FORMAL template uses the dynamic party and due-date labels

**Files:**
- Modify: `server/src/lib/pdf/formal-template.ts`
- Modify: `server/src/lib/pdf/formal-template.test.ts`

- [ ] **Step 1: Write the failing tests**

In `server/src/lib/pdf/formal-template.test.ts`, add to the `describe("renderFormalHtml"` block:

```ts
it("uses the dynamic party label instead of a hardcoded one", () => {
  const html = renderFormalHtml(makeData({ partyLabel: "Deliver to" }));
  expect(html).toContain("Deliver to");
});

it("uses the dynamic due date label when both are present", () => {
  const html = renderFormalHtml(
    makeData({ dueDateLabel: "Valid until", dueDate: "2026-09-01" }),
  );
  expect(html).toContain("Valid until: 2026-09-01");
  expect(html).not.toContain("Due:");
});

it("omits the due date line when there is no due date label", () => {
  const html = renderFormalHtml(makeData({ dueDateLabel: null, dueDate: null }));
  expect(html).not.toContain("Due");
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/lib/pdf/formal-template.test.ts`
Expected: FAIL on all three (still says "Bill to" and hardcoded "Due:").

- [ ] **Step 3: Use the dynamic labels**

In `server/src/lib/pdf/formal-template.ts`, change:

```ts
        <div class="meta-box">
          <div class="meta-box-label">Bill to</div>
          <div>${data.customer.name}</div>
          ${data.customer.address ? `<div>${data.customer.address}</div>` : ""}
        </div>
        <div class="meta-box">
          <div class="meta-box-label">Document details</div>
          <div>No: ${data.number ?? "DRAFT"}</div>
          <div>Issued: ${data.issueDate}</div>
          ${data.dueDate ? `<div>Due: ${data.dueDate}</div>` : ""}
        </div>
```

to:

```ts
        <div class="meta-box">
          <div class="meta-box-label">${data.partyLabel}</div>
          <div>${data.customer.name}</div>
          ${data.customer.address ? `<div>${data.customer.address}</div>` : ""}
        </div>
        <div class="meta-box">
          <div class="meta-box-label">Document details</div>
          <div>No: ${data.number ?? "DRAFT"}</div>
          <div>Issued: ${data.issueDate}</div>
          ${data.dueDateLabel && data.dueDate ? `<div>${data.dueDateLabel}: ${data.dueDate}</div>` : ""}
        </div>
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd server && npx vitest run src/lib/pdf/formal-template.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/pdf/formal-template.ts server/src/lib/pdf/formal-template.test.ts
git commit -m "use dynamic party and due-date labels in the FORMAL template"
```

---

### Task 5: SIDEBAR_ACCENT template uses the dynamic party and due-date labels

**Files:**
- Modify: `server/src/lib/pdf/sidebar-accent-template.ts`
- Modify: `server/src/lib/pdf/sidebar-accent-template.test.ts`

- [ ] **Step 1: Write the failing tests**

In `server/src/lib/pdf/sidebar-accent-template.test.ts`, add to the `describe("renderSidebarAccentHtml"` block:

```ts
it("uses the dynamic party label instead of a hardcoded one", () => {
  const html = renderSidebarAccentHtml(makeData({ partyLabel: "Deliver to" }));
  expect(html).toContain("Deliver to");
});

it("uses the dynamic due date label when both are present", () => {
  const html = renderSidebarAccentHtml(
    makeData({ dueDateLabel: "Valid until", dueDate: "2026-09-01" }),
  );
  expect(html).toContain("Valid until 2026-09-01");
});

it("omits the due date line when there is no due date label", () => {
  const html = renderSidebarAccentHtml(makeData({ dueDateLabel: null, dueDate: null }));
  expect(html).not.toContain("Due");
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/lib/pdf/sidebar-accent-template.test.ts`
Expected: FAIL on the first two (still says "Bill to"; due date line never renders at all today since the current test data has no `dueDate`).

- [ ] **Step 3: Use the dynamic labels**

In `server/src/lib/pdf/sidebar-accent-template.ts`, change:

```ts
      <div class="sidebar-section">
        <div class="sidebar-label">${data.typeLabel}</div>
        <div>${data.number ?? "DRAFT"}</div>
        <div>${data.issueDate}</div>
        ${data.dueDate ? `<div>Due ${data.dueDate}</div>` : ""}
        <div>${data.status}</div>
      </div>
```

to:

```ts
      <div class="sidebar-section">
        <div class="sidebar-label">${data.typeLabel}</div>
        <div>${data.number ?? "DRAFT"}</div>
        <div>${data.issueDate}</div>
        ${data.dueDateLabel && data.dueDate ? `<div>${data.dueDateLabel} ${data.dueDate}</div>` : ""}
        <div>${data.status}</div>
      </div>
```

And change:

```ts
      <div class="party-label">Bill to</div>
```

to:

```ts
      <div class="party-label">${data.partyLabel}</div>
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd server && npx vitest run src/lib/pdf/sidebar-accent-template.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the full server suite and typecheck**

Run: `cd server && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/pdf/sidebar-accent-template.ts server/src/lib/pdf/sidebar-accent-template.test.ts
git commit -m "use dynamic party and due-date labels in the SIDEBAR_ACCENT template"
```

---

### Task 6: `DocumentForm` adapts the due-date field per type

**Files:**
- Modify: `client/src/pages/DocumentForm.tsx`
- Modify: `client/src/pages/DocumentForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `client/src/pages/DocumentForm.test.tsx`, add a render helper alongside the existing `renderNew`/`renderEdit` (same file, so place it right after `renderNew`):

```tsx
function renderNewForType(type: string) {
  return render(
    <MemoryRouter initialEntries={[`/documents/new?type=${type}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/documents/new" element={<DocumentForm />} />
          <Route path="/documents/:id/edit" element={<DocumentForm />} />
          <Route path="/documents/:id" element={<div>view document page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}
```

Then add two tests to the `describe("DocumentForm"` block:

```tsx
it("hides the due date field for a delivery note", async () => {
  vi.spyOn(global, "fetch").mockImplementation(async () => new Response("{}", { status: 401 }));
  renderNewForType("DELIVERY_NOTE");

  await screen.findByText(/new delivery note/i);
  expect(screen.queryByLabelText(/due date/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/valid until/i)).not.toBeInTheDocument();
});

it("labels the due date field 'Valid until' for a quote", async () => {
  vi.spyOn(global, "fetch").mockImplementation(async () => new Response("{}", { status: 401 }));
  renderNewForType("QUOTE");

  expect(await screen.findByLabelText("Valid until")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/DocumentForm.test.tsx`
Expected: FAIL, the field is always present and always labeled "Due date".

- [ ] **Step 3: Adapt the field**

In `client/src/pages/DocumentForm.tsx`, change the import:

```ts
import type { DocumentType } from "@billa/shared";
```

to:

```ts
import { getDueDateLabel, type DocumentType } from "@billa/shared";
```

Add a computed value right after `const type = (searchParams.get("type") as DocumentType) ?? "INVOICE";`:

```ts
  const dueDateLabel = getDueDateLabel(type);
```

Change:

```tsx
            <FormField id="dueDate" label="Due date" type="date" error={errors.dueDate?.message} {...register("dueDate")} />
```

to:

```tsx
            {dueDateLabel && (
              <FormField
                id="dueDate"
                label={dueDateLabel}
                type="date"
                error={errors.dueDate?.message}
                {...register("dueDate")}
              />
            )}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd client && npx vitest run src/pages/DocumentForm.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/DocumentForm.tsx client/src/pages/DocumentForm.test.tsx
git commit -m "adapt the due-date field label and visibility per document type"
```

---

### Task 7: `AppLayout` gets all 5 document nav links

**Files:**
- Modify: `client/src/components/AppLayout.tsx`
- Modify: `client/src/components/AppLayout.test.tsx`

- [ ] **Step 1: Write the failing test**

In `client/src/components/AppLayout.test.tsx`, replace the single invoices assertion in the `"renders nav links and children"` test:

```tsx
    expect(screen.getByRole("link", { name: /invoices/i })).toBeInTheDocument();
```

with:

```tsx
    expect(screen.getByRole("link", { name: /^invoices$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /proforma invoices/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /delivery notes/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^quotes$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /receipts/i })).toBeInTheDocument();
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/components/AppLayout.test.tsx`
Expected: FAIL, only the "Invoices" link exists.

- [ ] **Step 3: Generate all 5 links**

In `client/src/components/AppLayout.tsx`, change the imports:

```ts
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
```

to:

```ts
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { DOCUMENT_TYPES } from "@billa/shared";
import { useAuth } from "../context/AuthContext";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";
```

Change:

```tsx
        <nav className="flex items-center gap-6">
          <Link to="/documents?type=INVOICE" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Invoices
          </Link>
          <Link to="/customers" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Customers
          </Link>
```

to:

```tsx
        <nav className="flex items-center gap-6">
          {DOCUMENT_TYPES.map((type) => (
            <Link
              key={type}
              to={`/documents?type=${type}`}
              className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900"
            >
              {DOCUMENT_TYPE_LABELS[type].plural}
            </Link>
          ))}
          <Link to="/customers" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Customers
          </Link>
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd client && npx vitest run src/components/AppLayout.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/AppLayout.tsx client/src/components/AppLayout.test.tsx
git commit -m "add nav links for all 5 document types"
```

---

### Task 8: `SequenceEditor` component

**Files:**
- Create: `client/src/components/business/SequenceEditor.tsx`
- Create: `client/src/components/business/SequenceEditor.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `client/src/components/business/SequenceEditor.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SequenceEditor } from "./SequenceEditor";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

const SEQUENCES = [
  { type: "INVOICE", prefix: "INV-", nextNumber: 3 },
  { type: "PROFORMA", prefix: "PRO-", nextNumber: 1 },
  { type: "DELIVERY_NOTE", prefix: "DN-", nextNumber: 1 },
  { type: "QUOTE", prefix: "QTE-", nextNumber: 1 },
  { type: "RECEIPT", prefix: "RCT-", nextNumber: 1 },
];

describe("SequenceEditor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads and shows the current prefix and next number for each type", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ sequences: SEQUENCES }), { status: 200 }),
    );

    render(<SequenceEditor />);

    expect(await screen.findByDisplayValue("INV-")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3")).toBeInTheDocument();
    expect(screen.getByDisplayValue("RCT-")).toBeInTheDocument();
  });

  it("submits the edited prefix", async () => {
    let putBody: unknown = null;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/business/sequences") && init?.method === "PUT") {
        putBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ sequences: SEQUENCES }), { status: 200 });
      }
      return new Response(JSON.stringify({ sequences: SEQUENCES }), { status: 200 });
    });

    const user = userEvent.setup();
    render(<SequenceEditor />);

    const invoicePrefixInput = await screen.findByDisplayValue("INV-");
    await user.clear(invoicePrefixInput);
    await user.type(invoicePrefixInput, "FAC-");
    await user.click(screen.getByRole("button", { name: /save numbering/i }));

    await waitFor(() =>
      expect(putBody).toContainEqual(expect.objectContaining({ type: "INVOICE", prefix: "FAC-" })),
    );
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/components/business/SequenceEditor.test.tsx`
Expected: FAIL, `Failed to resolve import "./SequenceEditor"`.

- [ ] **Step 3: Write the implementation**

Create `client/src/components/business/SequenceEditor.tsx`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { DOCUMENT_TYPES, updateSequencesSchema, type DocumentSequenceInput } from "@billa/shared";
import { DOCUMENT_TYPE_LABELS } from "../../lib/documentTypeLabels";
import { apiRequest, ApiError } from "../../lib/apiClient";

const sequencesFormSchema = z.object({ sequences: updateSequencesSchema });
type SequencesFormInput = z.infer<typeof sequencesFormSchema>;

export function SequenceEditor() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { register, handleSubmit, reset } = useForm<SequencesFormInput>({
    resolver: zodResolver(sequencesFormSchema),
    defaultValues: { sequences: [] },
  });

  useEffect(() => {
    apiRequest<{ sequences: DocumentSequenceInput[] }>("/business/sequences").then((data) => {
      reset({ sequences: data.sequences });
      setIsLoaded(true);
    });
  }, [reset]);

  async function onSubmit(data: SequencesFormInput) {
    setApiError(null);
    setIsSaving(true);
    try {
      await apiRequest("/business/sequences", { method: "PUT", body: data.sequences });
    } catch (err) {
      setApiError(err instanceof ApiError ? "Couldn't save numbering. Try again." : "Something went wrong. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!isLoaded) {
    return <p className="font-sans text-sm text-neutral-600">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="font-sans text-sm font-medium text-neutral-800">Document numbering</span>

      {apiError && (
        <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        {DOCUMENT_TYPES.map((type, index) => (
          <div key={type} className="flex items-center gap-3">
            <span className="w-40 font-sans text-sm text-neutral-700">{DOCUMENT_TYPE_LABELS[type].plural}</span>
            <input
              aria-label={`${DOCUMENT_TYPE_LABELS[type].plural} prefix`}
              className="w-24 rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-sm"
              {...register(`sequences.${index}.prefix`)}
            />
            <input
              type="number"
              aria-label={`${DOCUMENT_TYPE_LABELS[type].plural} next number`}
              className="w-24 rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-sm"
              {...register(`sequences.${index}.nextNumber`, { valueAsNumber: true })}
            />
          </div>
        ))}
        <button
          type="submit"
          disabled={isSaving}
          className="flex w-auto items-center justify-center self-start rounded-lg bg-primary-500 px-6 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSaving ? "Saving…" : "Save numbering"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd client && npx vitest run src/components/business/SequenceEditor.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/business/SequenceEditor.tsx client/src/components/business/SequenceEditor.test.tsx
git commit -m "add sequence editor component"
```

---

### Task 9: Embed `SequenceEditor` in Business Settings

**Files:**
- Modify: `client/src/pages/BusinessSettings.tsx`
- Modify: `client/src/pages/BusinessSettings.test.tsx`

`SequenceEditor` renders its own `<form>`, so it must sit as a sibling to `BusinessSettings`'s existing form, not nested inside it (HTML forms can't nest).

- [ ] **Step 1: Update the existing tests' fetch mocks**

`SequenceEditor` now mounts whenever `BusinessSettings` does, and fetches `/business/sequences` on mount. Both existing tests' fetch mocks need a branch for it, or that fetch falls through to the mock's default 401 and produces console noise.

In `client/src/pages/BusinessSettings.test.tsx`, in the first test (`"loads and shows the current business profile and template"`), change:

```tsx
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/business") || url.endsWith("/auth/me")) {
```

to:

```tsx
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/business/sequences")) {
        return new Response(
          JSON.stringify({
            sequences: [
              { type: "INVOICE", prefix: "INV-", nextNumber: 1 },
              { type: "PROFORMA", prefix: "PRO-", nextNumber: 1 },
              { type: "DELIVERY_NOTE", prefix: "DN-", nextNumber: 1 },
              { type: "QUOTE", prefix: "QTE-", nextNumber: 1 },
              { type: "RECEIPT", prefix: "RCT-", nextNumber: 1 },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business") || url.endsWith("/auth/me")) {
```

Make the same change in the second test (`"submits changed fields and the selected template"`): add the identical `/business/sequences` branch immediately after that test's `vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {` line, before its existing `if (url.endsWith("/business") && init?.method === "PATCH")` check.

- [ ] **Step 2: Run the existing tests to confirm they still pass**

Run: `cd client && npx vitest run src/pages/BusinessSettings.test.tsx`
Expected: PASS, 2 tests (this step is verifying the mock update didn't break anything; `SequenceEditor` isn't embedded yet so this should already pass before Step 3).

- [ ] **Step 3: Embed the component**

In `client/src/pages/BusinessSettings.tsx`, add the import:

```ts
import { SequenceEditor } from "../components/business/SequenceEditor";
```

Change the end of the component's JSX from:

```tsx
          <Button type="submit" isLoading={isSaving}>
            Save
          </Button>
        </form>
      </div>
    </AppLayout>
  );
}
```

to:

```tsx
          <Button type="submit" isLoading={isSaving}>
            Save
          </Button>
        </form>

        <SequenceEditor />
      </div>
    </AppLayout>
  );
}
```

- [ ] **Step 4: Run the test to confirm it still passes with the component embedded**

Run: `cd client && npx vitest run src/pages/BusinessSettings.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/BusinessSettings.tsx client/src/pages/BusinessSettings.test.tsx
git commit -m "embed the sequence editor in business settings"
```

---

### Task 10: Full suite, typecheck, and real-browser verification

**Files:** none (verification only)

- [ ] **Step 1: Run every workspace's test suite**

Run: `cd shared && npm test && cd ../server && npm test && cd ../client && npm test`
Expected: all pass.

- [ ] **Step 2: Typecheck every workspace**

Run: `cd shared && npm run typecheck && cd ../server && npm run typecheck && cd ../client && npm run typecheck`
Expected: no errors in any workspace.

- [ ] **Step 3: Real-browser verification**

Start both the API server (`npm run dev` in `server/`) and the client dev server, log in to an existing test account (or register a fresh one), then:

1. Confirm the nav bar now shows all 5 links: Invoices, Proforma invoices, Delivery notes, Quotes, Receipts.
2. Open a new quote (`/documents/new?type=QUOTE`). Confirm the date field reads "Valid until", not "Due date".
3. Open a new delivery note. Confirm there is no due-date field at all.
4. Open a new invoice. Confirm the due-date field still reads "Due date" (unchanged behavior).
5. Create and finalize a delivery note with a customer and one line. Download its PDF and confirm it says "DELIVER TO" (or "Deliver to", depending on the active template's casing) instead of "Bill to", and confirms it gets `DN-0001`.
6. Create and finalize a quote with a due date filled in. Download its PDF and confirm it shows "Valid until: <date>" instead of "Due:".
7. Go to Business Settings, confirm the new "Document numbering" section shows all 5 types with their current prefix and next number. Change one prefix, save, reload, and confirm it persisted.
8. Check the browser's console and network tab for unexpected errors during all of the above.

- [ ] **Step 4: Fix any issues found**

If real-browser verification finds bugs, fix them, add or update the relevant test(s) to cover what was missed, re-run that test file to confirm it passes, then commit the fix as its own commit.

- [ ] **Step 5: Final confirmation**

Once every workspace's suite passes, every workspace typechecks, and manual verification found no outstanding issues, this stage is done.

---

## Self-review notes

- **Spec coverage:** nav links (Task 7), due-date label/visibility (Tasks 1, 2, 4, 5, 6), party label (Tasks 1, 2, 3, 4, 5), sequence editor (Tasks 8, 9). All spec sections have a task.
- **Placeholder scan:** no TBD/TODO; every step shows real code or an exact command.
- **Type consistency:** `PdfRenderData.partyLabel`/`dueDateLabel` (Task 2) are consumed identically by all three templates (Tasks 3-5); `getDueDateLabel`/`getPartyLabel` (Task 1) are consumed identically by `render-data.ts` (Task 2) and `DocumentForm.tsx` (Task 6); `DocumentSequenceInput` and `updateSequencesSchema` (Task 8) are the same types already exported from `shared/src/business-schemas.ts`, not redefined.
