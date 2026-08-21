# Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a confirmed bug (document type lost after saving), close the structural accessibility gaps found across the app's list pages, and stop four components from getting stuck on an infinite "Loading…" state when their initial data fetch fails.

**Architecture:** No new pages, no visual redesign. Each task is a targeted fix to an existing file, following the exact patterns (error banners, `role="alert"`, `aria-label`) already established elsewhere in the app.

**Tech Stack:** Existing React/Vite/Tailwind client. No server or shared changes.

Reference: `docs/superpowers/specs/2026-08-19-polish-pass-design.md`

---

### Task 1: Fix document type lost after saving

**Files:**
- Modify: `client/src/pages/DocumentForm.tsx`
- Modify: `client/src/pages/DocumentForm.test.tsx`

- [ ] **Step 1: Write the failing test and update existing mocks**

In `client/src/pages/DocumentForm.test.tsx`, five existing tests mock a `/documents/d1` response without a `type` field. Once `type` becomes state derived from the loaded document, `DOCUMENT_TYPE_LABELS[undefined]` would be `undefined` and rendering would throw. Add `type: "INVOICE",` to each of these five mock document objects (each is inside `JSON.stringify({ document: { ... } })`):

1. In `"saves a new draft and navigates to its edit URL"`, the mock for `url.endsWith("/documents/d1") && init?.method !== "PATCH"`.
2. In `"loads an existing draft for editing"`, the mock for `url.endsWith("/documents/d1")`.
3. In `"finalizes a document after confirming and navigates to the view page"`, the mock for `url.endsWith("/documents/d1") && init?.method !== "POST"`.
4. In `"opens the PDF download URL for an existing draft"`, the mock for `url.endsWith("/documents/d1")`.
5. In `"shows a Converted from proforma link when editing a converted invoice"`, the mock for `url.endsWith("/documents/d1")`.

For example, test 2 becomes:

```tsx
  it("loads an existing draft for editing", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/documents/d1")) {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              type: "INVOICE",
              customerId: "c1",
              customer: { name: "Kigali Traders" },
              issueDate: "2026-08-19T00:00:00.000Z",
              dueDate: null,
              notes: null,
              lines: [{ id: "l1", itemId: null, description: "Printing", quantity: "2.00", unitPrice: 5000, taxRate: "18.00" }],
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderEdit("d1");

    expect(await screen.findByDisplayValue("Printing")).toBeInTheDocument();
    expect(screen.getByText(/subtotal: 10,000 rwf/i)).toBeInTheDocument();
  });
```

Apply the same one-line addition (`type: "INVOICE",` right after `id: "d1",`) to the other four tests' mocks.

Then add this new test at the end of the `describe("DocumentForm", ...)` block, right before the closing `});`:

```tsx
  it("uses the loaded document's type for labels instead of falling back to invoice", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/documents/d1")) {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              type: "PROFORMA",
              customerId: "c1",
              customer: { name: "Kigali Traders" },
              issueDate: "2026-08-19T00:00:00.000Z",
              dueDate: null,
              notes: null,
              lines: [],
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderEdit("d1");

    expect(await screen.findByText(/edit proforma invoice/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Valid until")).toBeInTheDocument();
    expect(screen.queryByLabelText(/due date/i)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/DocumentForm.test.tsx`
Expected: the new test FAILS (`renderEdit("d1")` carries no `?type=` param, so today's code falls back to `"INVOICE"` and renders "Edit invoice" / "Due date" instead of "Edit proforma invoice" / "Valid until"). The five updated mocks should still PASS unchanged, since adding an extra `type` field to a mock doesn't affect today's behavior (the field is simply unused by the current, unfixed code).

- [ ] **Step 3: Write the implementation**

In `client/src/pages/DocumentForm.tsx`, add `type: DocumentType;` to the `DocumentResponse` interface:

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

becomes:

```ts
interface DocumentResponse {
  id: string;
  type: DocumentType;
  customerId: string;
  customer: { name: string };
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  lines: DocumentLineResponse[];
  convertedFrom: { id: string; number: string | null } | null;
}
```

Change how `type` is derived, from a plain const to state that starts from the URL param and gets overridden once a real document loads:

```ts
  const [searchParams] = useSearchParams();
  const type = (searchParams.get("type") as DocumentType) ?? "INVOICE";
```

becomes:

```ts
  const [searchParams] = useSearchParams();
  const [type, setType] = useState<DocumentType>(() => (searchParams.get("type") as DocumentType) ?? "INVOICE");
```

In the load effect, set the type once the document arrives:

```ts
  useEffect(() => {
    if (!isEditing) return;
    apiRequest<{ document: DocumentResponse }>(`/documents/${id}`).then((data) => {
      const doc = data.document;
      reset({
```

becomes:

```ts
  useEffect(() => {
    if (!isEditing) return;
    apiRequest<{ document: DocumentResponse }>(`/documents/${id}`).then((data) => {
      const doc = data.document;
      setType(doc.type);
      reset({
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd client && npx vitest run src/pages/DocumentForm.test.tsx`
Expected: PASS, all 9 tests (the 8 pre-existing tests plus the new one).

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/DocumentForm.tsx client/src/pages/DocumentForm.test.tsx
git commit -m "fix document type falling back to invoice after saving"
```

---

### Task 2: Accessibility fixes for `Documents.tsx`

**Files:**
- Modify: `client/src/pages/Documents.tsx`
- Modify: `client/src/pages/Documents.test.tsx`

Three fixes in this file: the search input has no accessible label, the two sortable column headers are clickable `<th>` elements rather than real buttons, and the clickable table row isn't keyboard-reachable.

- [ ] **Step 1: Write the failing tests**

Add these three tests inside the existing `describe("Documents", ...)` block in `client/src/pages/Documents.test.tsx`, after the last test:

```tsx
  it("has an accessible label on the search input", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 }),
    );
    renderDocuments();
    await screen.findByText(/no invoices yet/i);

    expect(screen.getByLabelText("Search invoices")).toBeInTheDocument();
  });

  it("sorts by date when the Date header button is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: "d1",
              type: "INVOICE",
              number: "INV-0001",
              status: "FINALIZED",
              issueDate: "2026-08-19T00:00:00.000Z",
              total: 5900,
              customer: { name: "Kigali Traders" },
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
        { status: 200 },
      ),
    );
    const user = userEvent.setup();
    renderDocuments();
    await screen.findByText("INV-0001");

    await user.click(screen.getByRole("button", { name: /^date$/i }));

    expect(screen.getByRole("button", { name: /^date ↑$/i })).toBeInTheDocument();
  });

  it("navigates via the keyboard when Enter is pressed on a row", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: "d1",
              type: "INVOICE",
              number: null,
              status: "DRAFT",
              issueDate: "2026-08-19T00:00:00.000Z",
              total: 0,
              customer: { name: "Kigali Traders" },
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
        { status: 200 },
      ),
    );
    const user = userEvent.setup();
    renderDocuments();

    const row = await screen.findByRole("button", { name: /view draft document/i });
    row.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByText("edit document page")).toBeInTheDocument());
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/Documents.test.tsx`
Expected: FAIL on all three new tests (no `aria-label` on the search input, no real button in the header, no `role="button"` on the row).

- [ ] **Step 3: Write the implementation**

In `client/src/pages/Documents.tsx`, add an `aria-label` to the search input:

```tsx
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={list.search}
            onChange={(event) => list.updateSearch(event.target.value)}
            className="w-full max-w-xs rounded-lg border border-neutral-200 px-3.5 py-2 font-sans text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
```

becomes:

```tsx
          <input
            type="text"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            value={list.search}
            onChange={(event) => list.updateSearch(event.target.value)}
            className="w-full max-w-xs rounded-lg border border-neutral-200 px-3.5 py-2 font-sans text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
```

Convert both sortable headers to wrap a real button:

```tsx
                <th className="cursor-pointer py-2" onClick={() => list.toggleSort("issueDate")}>
                  Date {list.sortBy === "issueDate" && (list.sortOrder === "asc" ? "↑" : "↓")}
                </th>
                {isUnified && <th className="py-2">Type</th>}
                <th className="py-2">Number</th>
                <th className="py-2">Customer</th>
                <th className="cursor-pointer py-2" onClick={() => list.toggleSort("total")}>
                  Total {list.sortBy === "total" && (list.sortOrder === "asc" ? "↑" : "↓")}
                </th>
```

becomes:

```tsx
                <th className="py-2">
                  <button type="button" onClick={() => list.toggleSort("issueDate")} className="cursor-pointer">
                    Date {list.sortBy === "issueDate" && (list.sortOrder === "asc" ? "↑" : "↓")}
                  </button>
                </th>
                {isUnified && <th className="py-2">Type</th>}
                <th className="py-2">Number</th>
                <th className="py-2">Customer</th>
                <th className="py-2">
                  <button type="button" onClick={() => list.toggleSort("total")} className="cursor-pointer">
                    Total {list.sortBy === "total" && (list.sortOrder === "asc" ? "↑" : "↓")}
                  </button>
                </th>
```

Make the row keyboard-reachable, guarding the keydown handler so it only fires when the row itself (not a nested button like Download) has focus:

```tsx
                <tr
                  key={document.id}
                  onClick={() => openDocument(document)}
                  className="cursor-pointer border-b border-neutral-100 hover:bg-neutral-50"
                >
```

becomes:

```tsx
                <tr
                  key={document.id}
                  onClick={() => openDocument(document)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openDocument(document);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`View ${document.number ?? "draft"} document`}
                  className="cursor-pointer border-b border-neutral-100 hover:bg-neutral-50"
                >
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd client && npx vitest run src/pages/Documents.test.tsx`
Expected: PASS, all 12 tests (the 9 pre-existing tests plus the 3 new ones).

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Documents.tsx client/src/pages/Documents.test.tsx
git commit -m "make the document list search, sort headers, and rows keyboard accessible"
```

---

### Task 3: Accessibility fixes for `Customers.tsx`

**Files:**
- Modify: `client/src/pages/Customers.tsx`
- Modify: `client/src/pages/Customers.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add these three tests inside the existing `describe("Customers", ...)` block in `client/src/pages/Customers.test.tsx`, after the last test:

```tsx
  it("has an accessible label on the search input", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 }),
    );
    renderCustomers();
    await screen.findByText(/no customers yet/i);

    expect(screen.getByLabelText("Search customers")).toBeInTheDocument();
  });

  it("opens the edit modal when a customer's name button is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({
            results: [
              { id: "c1", name: "Kigali Traders", tin: null, address: null, phone: null, email: null, isActive: true },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();
    renderCustomers();
    await screen.findByText("Kigali Traders");

    await user.click(screen.getByRole("button", { name: "Kigali Traders" }));

    expect(await screen.findByText("Edit customer")).toBeInTheDocument();
  });

  it("sorts by name when the Name header button is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          results: [
            { id: "c1", name: "Kigali Traders", tin: null, address: null, phone: null, email: null, isActive: true },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
        { status: 200 },
      ),
    );
    const user = userEvent.setup();
    renderCustomers();
    await screen.findByText("Kigali Traders");

    await user.click(screen.getByRole("button", { name: /^name$/i }));

    expect(screen.getByRole("button", { name: /^name ↑$/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/Customers.test.tsx`
Expected: FAIL on all three new tests.

- [ ] **Step 3: Write the implementation**

In `client/src/pages/Customers.tsx`, add an `aria-label` to the search input:

```tsx
          <input
            type="text"
            placeholder="Search customers"
            value={list.search}
            onChange={(event) => list.updateSearch(event.target.value)}
            className="w-full max-w-xs rounded-lg border border-neutral-200 px-3.5 py-2 font-sans text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
```

becomes:

```tsx
          <input
            type="text"
            placeholder="Search customers"
            aria-label="Search customers"
            value={list.search}
            onChange={(event) => list.updateSearch(event.target.value)}
            className="w-full max-w-xs rounded-lg border border-neutral-200 px-3.5 py-2 font-sans text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
```

Convert the sortable Name header to wrap a real button:

```tsx
                <th className="cursor-pointer py-2" onClick={() => list.toggleSort("name")}>
                  Name {list.sortBy === "name" && (list.sortOrder === "asc" ? "↑" : "↓")}
                </th>
```

becomes:

```tsx
                <th className="py-2">
                  <button type="button" onClick={() => list.toggleSort("name")} className="cursor-pointer">
                    Name {list.sortBy === "name" && (list.sortOrder === "asc" ? "↑" : "↓")}
                  </button>
                </th>
```

Move the clickable cell's `onClick` onto a real button:

```tsx
                  <td className="cursor-pointer py-3" onClick={() => openEditModal(customer)}>
                    {customer.name}
                  </td>
```

becomes:

```tsx
                  <td className="py-3">
                    <button type="button" onClick={() => openEditModal(customer)} className="cursor-pointer text-left">
                      {customer.name}
                    </button>
                  </td>
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd client && npx vitest run src/pages/Customers.test.tsx`
Expected: PASS, all 7 tests (the 4 pre-existing tests plus the 3 new ones).

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Customers.tsx client/src/pages/Customers.test.tsx
git commit -m "make the customers list search, sort header, and row-open action keyboard accessible"
```

---

### Task 4: Accessibility fixes for `Items.tsx`

**Files:**
- Modify: `client/src/pages/Items.tsx`
- Modify: `client/src/pages/Items.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add these three tests inside the existing `describe("Items", ...)` block in `client/src/pages/Items.test.tsx`, after the last test:

```tsx
  it("has an accessible label on the search input", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 }),
    );
    renderItems();
    await screen.findByText(/no items yet/i);

    expect(screen.getByLabelText("Search items")).toBeInTheDocument();
  });

  it("opens the edit modal when an item's description button is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/items")) {
        return new Response(
          JSON.stringify({
            results: [{ id: "i1", description: "Printing service", unitPrice: 5000, unit: "service", isActive: true }],
            total: 1,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();
    renderItems();
    await screen.findByText("Printing service");

    await user.click(screen.getByRole("button", { name: "Printing service" }));

    expect(await screen.findByText("Edit item")).toBeInTheDocument();
  });

  it("sorts by description when the Description header button is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          results: [{ id: "i1", description: "Printing service", unitPrice: 5000, unit: "service", isActive: true }],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
        { status: 200 },
      ),
    );
    const user = userEvent.setup();
    renderItems();
    await screen.findByText("Printing service");

    await user.click(screen.getByRole("button", { name: /^description$/i }));

    expect(screen.getByRole("button", { name: /^description ↑$/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/Items.test.tsx`
Expected: FAIL on all three new tests.

- [ ] **Step 3: Write the implementation**

In `client/src/pages/Items.tsx`, add an `aria-label` to the search input:

```tsx
          <input
            type="text"
            placeholder="Search items"
            value={list.search}
            onChange={(event) => list.updateSearch(event.target.value)}
            className="w-full max-w-xs rounded-lg border border-neutral-200 px-3.5 py-2 font-sans text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
```

becomes:

```tsx
          <input
            type="text"
            placeholder="Search items"
            aria-label="Search items"
            value={list.search}
            onChange={(event) => list.updateSearch(event.target.value)}
            className="w-full max-w-xs rounded-lg border border-neutral-200 px-3.5 py-2 font-sans text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
```

Convert both sortable headers to wrap a real button:

```tsx
                <th className="cursor-pointer py-2" onClick={() => list.toggleSort("description")}>
                  Description {list.sortBy === "description" && (list.sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th className="cursor-pointer py-2" onClick={() => list.toggleSort("unitPrice")}>
                  Price {list.sortBy === "unitPrice" && (list.sortOrder === "asc" ? "↑" : "↓")}
                </th>
```

becomes:

```tsx
                <th className="py-2">
                  <button type="button" onClick={() => list.toggleSort("description")} className="cursor-pointer">
                    Description {list.sortBy === "description" && (list.sortOrder === "asc" ? "↑" : "↓")}
                  </button>
                </th>
                <th className="py-2">
                  <button type="button" onClick={() => list.toggleSort("unitPrice")} className="cursor-pointer">
                    Price {list.sortBy === "unitPrice" && (list.sortOrder === "asc" ? "↑" : "↓")}
                  </button>
                </th>
```

Move the clickable cell's `onClick` onto a real button:

```tsx
                  <td className="cursor-pointer py-3" onClick={() => openEditModal(item)}>
                    {item.description}
                  </td>
```

becomes:

```tsx
                  <td className="py-3">
                    <button type="button" onClick={() => openEditModal(item)} className="cursor-pointer text-left">
                      {item.description}
                    </button>
                  </td>
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd client && npx vitest run src/pages/Items.test.tsx`
Expected: PASS, all 7 tests (the 4 pre-existing tests plus the 3 new ones).

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Items.tsx client/src/pages/Items.test.tsx
git commit -m "make the items list search, sort headers, and row-open action keyboard accessible"
```

---

### Task 5: Surface load errors on `BusinessSettings.tsx` and `SequenceEditor.tsx`

**Files:**
- Modify: `client/src/pages/BusinessSettings.tsx`
- Modify: `client/src/components/business/SequenceEditor.tsx`
- Modify: `client/src/pages/BusinessSettings.test.tsx`

Both components load data via `apiRequest(...).then(...)` with no `.catch`. If the initial fetch fails, each is stuck on its "Loading…" placeholder forever, since their loading guard (`if (!profile)` / `if (!isLoaded)`) never resolves.

- [ ] **Step 1: Write the failing tests**

Add these two tests inside the existing `describe("BusinessSettings", ...)` block in `client/src/pages/BusinessSettings.test.tsx`, after the last test:

```tsx
  it("shows an error message when the business profile fails to load", async () => {
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
      return new Response("{}", { status: 500 });
    });

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load your business settings/i);
  });

  it("shows an error message when document numbering fails to load", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/business") || url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            business: {
              name: "Kigali Traders",
              tin: null,
              industry: null,
              phone: null,
              email: null,
              address: null,
              rraEbmNumber: null,
              defaultTemplate: "MINIMAL",
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 500 });
    });

    renderPage();

    expect(await screen.findByText(/couldn't load document numbering/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/BusinessSettings.test.tsx`
Expected: both new tests FAIL by timing out waiting for text/role that never appears (the page is stuck on "Loading…").

- [ ] **Step 3: Write the implementation**

In `client/src/pages/BusinessSettings.tsx`, add a `loadError` state and catch the fetch failure:

```ts
export default function BusinessSettings() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    apiRequest<{ business: BusinessProfile }>("/business").then((data) => setProfile(data.business));
  }, []);
```

becomes:

```ts
export default function BusinessSettings() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    apiRequest<{ business: BusinessProfile }>("/business")
      .then((data) => setProfile(data.business))
      .catch(() => setLoadError(true));
  }, []);
```

Show an error state instead of looping on "Loading…" forever:

```tsx
  if (!profile) {
    return (
      <AppLayout>
        <p className="font-sans text-sm text-neutral-600">Loading…</p>
      </AppLayout>
    );
  }
```

becomes:

```tsx
  if (loadError) {
    return (
      <AppLayout>
        <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          Couldn't load your business settings. Try again.
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return (
      <AppLayout>
        <p className="font-sans text-sm text-neutral-600">Loading…</p>
      </AppLayout>
    );
  }
```

In `client/src/components/business/SequenceEditor.tsx`, the same pattern:

```ts
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
```

becomes:

```ts
export function SequenceEditor() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { register, handleSubmit, reset } = useForm<SequencesFormInput>({
    resolver: zodResolver(sequencesFormSchema),
    defaultValues: { sequences: [] },
  });

  useEffect(() => {
    apiRequest<{ sequences: DocumentSequenceInput[] }>("/business/sequences")
      .then((data) => {
        reset({ sequences: data.sequences });
        setIsLoaded(true);
      })
      .catch(() => setLoadError(true));
  }, [reset]);
```

```tsx
  if (!isLoaded) {
    return <p className="font-sans text-sm text-neutral-600">Loading…</p>;
  }
```

becomes:

```tsx
  if (loadError) {
    return (
      <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
        Couldn't load document numbering. Try again.
      </div>
    );
  }

  if (!isLoaded) {
    return <p className="font-sans text-sm text-neutral-600">Loading…</p>;
  }
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd client && npx vitest run src/pages/BusinessSettings.test.tsx`
Expected: PASS, all 4 tests (the 2 pre-existing tests plus the 2 new ones).

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/BusinessSettings.tsx client/src/components/business/SequenceEditor.tsx client/src/pages/BusinessSettings.test.tsx
git commit -m "show an error instead of an infinite loading state when business settings fail to load"
```

---

### Task 6: Surface load errors on `DocumentForm.tsx`

**Files:**
- Modify: `client/src/pages/DocumentForm.tsx`
- Modify: `client/src/pages/DocumentForm.test.tsx`

- [ ] **Step 1: Write the failing test**

Add this test at the end of the `describe("DocumentForm", ...)` block in `client/src/pages/DocumentForm.test.tsx`, right before the closing `});`:

```tsx
  it("shows an error message when the document fails to load", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => new Response("{}", { status: 500 }));

    renderEdit("d1");

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load this document/i);
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/DocumentForm.test.tsx`
Expected: FAIL by timing out (the page is stuck on "Loading…").

- [ ] **Step 3: Write the implementation**

In `client/src/pages/DocumentForm.tsx`, add a `loadError` state:

```ts
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(!isEditing);
  const [convertedFrom, setConvertedFrom] = useState<{ id: string; number: string | null } | null>(null);
```

becomes:

```ts
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(!isEditing);
  const [loadError, setLoadError] = useState(false);
  const [convertedFrom, setConvertedFrom] = useState<{ id: string; number: string | null } | null>(null);
```

Catch the load failure (this builds on Task 1's `setType(doc.type)` addition):

```ts
  useEffect(() => {
    if (!isEditing) return;
    apiRequest<{ document: DocumentResponse }>(`/documents/${id}`).then((data) => {
      const doc = data.document;
      setType(doc.type);
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

becomes:

```ts
  useEffect(() => {
    if (!isEditing) return;
    apiRequest<{ document: DocumentResponse }>(`/documents/${id}`)
      .then((data) => {
        const doc = data.document;
        setType(doc.type);
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
      })
      .catch(() => setLoadError(true));
  }, [id, isEditing, reset]);
```

Show an error state instead of looping on "Loading…" forever:

```tsx
  if (!isLoaded) {
    return (
      <AppLayout>
        <p className="font-sans text-sm text-neutral-600">Loading…</p>
      </AppLayout>
    );
  }
```

becomes:

```tsx
  if (loadError) {
    return (
      <AppLayout>
        <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          Couldn't load this document. Try again.
        </div>
      </AppLayout>
    );
  }

  if (!isLoaded) {
    return (
      <AppLayout>
        <p className="font-sans text-sm text-neutral-600">Loading…</p>
      </AppLayout>
    );
  }
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd client && npx vitest run src/pages/DocumentForm.test.tsx`
Expected: PASS, all 10 tests.

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/DocumentForm.tsx client/src/pages/DocumentForm.test.tsx
git commit -m "show an error instead of an infinite loading state when a document fails to load in DocumentForm"
```

---

### Task 7: Surface load errors on `DocumentView.tsx`

**Files:**
- Modify: `client/src/pages/DocumentView.tsx`
- Modify: `client/src/pages/DocumentView.test.tsx`

- [ ] **Step 1: Write the failing test**

Add this test at the end of the `describe("DocumentView", ...)` block in `client/src/pages/DocumentView.test.tsx`, right before the closing `});`:

```tsx
  it("shows an error message when the document fails to load", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => new Response("{}", { status: 500 }));

    render(
      <MemoryRouter initialEntries={["/documents/d1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/documents/:id" element={<DocumentView />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load this document/i);
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/DocumentView.test.tsx`
Expected: FAIL by timing out (the page is stuck on "Loading…").

- [ ] **Step 3: Write the implementation**

In `client/src/pages/DocumentView.tsx`, add a `loadError` state and catch the fetch failure:

```ts
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  useEffect(() => {
    apiRequest<{ document: DocumentDetail }>(`/documents/${id}`).then((data) => setDocument(data.document));
  }, [id]);
```

becomes:

```ts
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    apiRequest<{ document: DocumentDetail }>(`/documents/${id}`)
      .then((data) => setDocument(data.document))
      .catch(() => setLoadError(true));
  }, [id]);
```

Show an error state instead of looping on "Loading…" forever:

```tsx
  if (!document) {
    return (
      <AppLayout>
        <p className="font-sans text-sm text-neutral-600">Loading…</p>
      </AppLayout>
    );
  }
```

becomes:

```tsx
  if (loadError) {
    return (
      <AppLayout>
        <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          Couldn't load this document. Try again.
        </div>
      </AppLayout>
    );
  }

  if (!document) {
    return (
      <AppLayout>
        <p className="font-sans text-sm text-neutral-600">Loading…</p>
      </AppLayout>
    );
  }
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd client && npx vitest run src/pages/DocumentView.test.tsx`
Expected: PASS, all 8 tests (the 7 pre-existing tests plus the new one).

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/DocumentView.tsx client/src/pages/DocumentView.test.tsx
git commit -m "show an error instead of an infinite loading state when a document fails to load in DocumentView"
```

---

### Task 8: Full suite, typecheck, and real-browser verification

**Files:** none (verification only)

- [ ] **Step 1: Run every workspace's test suite**

Run: `cd shared && npm test && cd ../server && npm test && cd ../client && npm test`
Expected: all pass.

- [ ] **Step 2: Typecheck every workspace**

Run: `cd shared && npm run typecheck && cd ../server && npm run typecheck && cd ../client && npm run typecheck`
Expected: no errors in any workspace.

- [ ] **Step 3: Real-browser verification**

Using an existing test account:

1. Create a new proforma (or any non-invoice type), save it as a draft, and confirm the edit page immediately shows the correct type in the heading and field labels (e.g. "Edit proforma invoice" / "Valid until"), not "Edit invoice" / "Due date". This is the Task 1 bug fix.
2. On the Documents, Customers, and Items list pages: tab through the page with the keyboard and confirm the search input, sort headers, and (on Documents) a table row can all be reached and activated without a mouse. Click a sort header with the mouse too, to confirm it still sorts.
3. On Documents specifically: with the keyboard focus on a row, press Enter and confirm it navigates; then click the row's Download button directly and confirm it does NOT also navigate (this is the nested-button guard from Task 2).
4. On Customers and Items: click a row's name/description button and confirm the edit modal opens.
5. Simulate a load failure for Business Settings, an existing document's edit page, and an existing document's view page (e.g. by briefly stopping the API server or using dev tools to block the relevant request) and confirm each shows a "Couldn't load…" error message instead of spinning on "Loading…" forever.
6. Check the browser's console and network tab for unexpected errors during all of the above.

- [ ] **Step 4: Fix any issues found**

If real-browser verification finds bugs, fix them, add or update the relevant test(s) to cover what was missed, re-run that test file to confirm it passes, then commit the fix as its own commit.

- [ ] **Step 5: Final confirmation**

Once every workspace's suite passes, every workspace typechecks, and manual verification found no outstanding issues, this stage — and the full build-order in the README — is done.

---

## Self-review notes

- **Spec coverage:** the type-loss bug fix (Task 1), unlabeled search inputs and non-button sort headers/clickable cells across all three list pages (Tasks 2, 3, 4), and the four load-error gaps found by the audit (Tasks 5, 6, 7) are all covered by a task. Nothing in the design doc is left without a corresponding task.
- **Placeholder scan:** no TBD/TODO; every step shows real code or an exact command.
- **Type consistency:** `DocumentResponse.type: DocumentType` (Task 1) matches the field name and type already used identically in `DocumentView.tsx`'s `DocumentDetail` interface. The `loadError` state name and its `role="alert"` rendering pattern are identical across Tasks 5, 6, and 7. Task 6's diff is written against Task 1's already-modified version of the same `useEffect` (including the `setType(doc.type)` line Task 1 adds), not the original pre-Task-1 code, since Task 6 runs after Task 1 in execution order.
