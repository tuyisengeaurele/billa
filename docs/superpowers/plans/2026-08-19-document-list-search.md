# Document List & Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified "All documents" view spanning all 5 document types, plus a date range filter available on every document list page (unified and per-type alike).

**Architecture:** The list query schema and `GET /documents` route generalize `type` from a required single value to an optional comma-separated list, and gain optional `dateFrom`/`dateTo` params. The existing `Documents.tsx` page generalizes rather than a new page being added: with a `?type=` URL param it behaves exactly as today; without one (a new "All documents" nav link pointing at the bare `/documents` route) it shows a Type column, multi-select type filter chips, and drops the create button.

**Tech Stack:** Existing Express/Prisma server, existing React/Vite client, Zod for query validation. No schema/migration changes.

Reference: `docs/superpowers/specs/2026-08-19-document-list-search-design.md`

---

### Task 1: Generalize `documentListQuerySchema`

**Files:**
- Modify: `shared/src/document-schemas.ts`
- Test: `shared/src/document-schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

In `shared/src/document-schemas.test.ts`, replace the existing `describe("documentListQuerySchema", ...)` block:

```ts
describe("documentListQuerySchema", () => {
  it("requires a type", () => {
    expect(documentListQuerySchema.safeParse({}).success).toBe(false);
  });

  it("applies defaults when only type is provided", () => {
    expect(documentListQuerySchema.parse({ type: "INVOICE" })).toEqual({
      type: "INVOICE",
      sortBy: "createdAt",
      sortOrder: "desc",
      page: 1,
      pageSize: 20,
    });
  });
});
```

with:

```ts
describe("documentListQuerySchema", () => {
  it("has no type filter when type is omitted", () => {
    expect(documentListQuerySchema.parse({}).type).toBeUndefined();
  });

  it("parses a single type into a one-item array", () => {
    expect(documentListQuerySchema.parse({ type: "INVOICE" })).toEqual({
      type: ["INVOICE"],
      sortBy: "createdAt",
      sortOrder: "desc",
      page: 1,
      pageSize: 20,
    });
  });

  it("parses a comma-separated type list into an array", () => {
    expect(documentListQuerySchema.parse({ type: "INVOICE,PROFORMA" }).type).toEqual(["INVOICE", "PROFORMA"]);
  });

  it("rejects an unknown type", () => {
    expect(documentListQuerySchema.safeParse({ type: "BANANA" }).success).toBe(false);
  });

  it("accepts dateFrom and dateTo", () => {
    const result = documentListQuerySchema.parse({ dateFrom: "2026-08-01", dateTo: "2026-08-31" });
    expect(result.dateFrom).toBe("2026-08-01");
    expect(result.dateTo).toBe("2026-08-31");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd shared && npx vitest run src/document-schemas.test.ts`
Expected: FAIL — the old two tests are gone so there's nothing to fail on those, but the 5 new tests fail against the current schema (`type` is still required and stays a string, `dateFrom`/`dateTo` aren't defined yet).

- [ ] **Step 3: Update the schema**

In `shared/src/document-schemas.ts`, change the import:

```ts
import { z } from "zod";
import { DOCUMENT_TYPES } from "./document-types.js";
```

to:

```ts
import { z } from "zod";
import { DOCUMENT_TYPES, type DocumentType } from "./document-types.js";
```

Replace `documentListQuerySchema`:

```ts
export const documentListQuerySchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  search: z.string().trim().optional(),
  sortBy: z.enum(["issueDate", "total", "createdAt"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;
```

with:

```ts
export const documentListQuerySchema = z.object({
  type: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(",") : undefined))
    .refine(
      (types): types is DocumentType[] | undefined =>
        !types || types.every((t) => (DOCUMENT_TYPES as readonly string[]).includes(t)),
      "Invalid document type",
    ),
  search: z.string().trim().optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  sortBy: z.enum(["issueDate", "total", "createdAt"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd shared && npx vitest run src/document-schemas.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Run the full shared suite and typecheck**

Run: `cd shared && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add shared/src/document-schemas.ts shared/src/document-schemas.test.ts
git commit -m "make document list type filter optional and multi-valued, add date range params"
```

---

### Task 2: `GET /documents` supports the new type list and date range

**Files:**
- Modify: `server/src/routes/documents.ts`
- Test: `server/src/routes/documents.list.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `server/src/routes/documents.list.test.ts`:

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

async function createDocument(
  app: ReturnType<typeof createApp>,
  cookies: string[],
  customerId: string,
  type = "INVOICE",
  issueDate = "2026-08-19",
) {
  const res = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type,
      customerId,
      issueDate,
      lines: [{ description: "Printing", quantity: 2, unitPrice: 5000, taxRate: 18 }],
    });
  return res.body.document.id as string;
}

describe("GET /documents", () => {
  it("returns documents scoped to the authenticated business and type", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId);
    await createDocument(app, cookies, customerId);

    const res = await request(app).get("/documents?type=INVOICE").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0].customer.name).toBe("Musanze Supplies");
  });

  it("only returns documents of the requested type", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId, "INVOICE");
    await createDocument(app, cookies, customerId, "QUOTE");

    const res = await request(app).get("/documents?type=INVOICE").set("Cookie", cookies);

    expect(res.body.total).toBe(1);
  });

  it("returns all types when type is omitted", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId, "INVOICE");
    await createDocument(app, cookies, customerId, "QUOTE");

    const res = await request(app).get("/documents").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  it("filters by multiple types via a comma-separated list", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId, "INVOICE");
    await createDocument(app, cookies, customerId, "PROFORMA");
    await createDocument(app, cookies, customerId, "QUOTE");

    const res = await request(app).get("/documents?type=INVOICE,PROFORMA").set("Cookie", cookies);

    expect(res.body.total).toBe(2);
  });

  it("filters by dateFrom", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId, "INVOICE", "2026-08-01");
    await createDocument(app, cookies, customerId, "INVOICE", "2026-08-20");

    const res = await request(app).get("/documents?dateFrom=2026-08-10").set("Cookie", cookies);

    expect(res.body.total).toBe(1);
  });

  it("filters by dateTo, inclusive of that day", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId, "INVOICE", "2026-08-10");
    await createDocument(app, cookies, customerId, "INVOICE", "2026-08-11");

    const res = await request(app).get("/documents?dateTo=2026-08-10").set("Cookie", cookies);

    expect(res.body.total).toBe(1);
  });

  it("filters by both dateFrom and dateTo", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId, "INVOICE", "2026-08-05");
    await createDocument(app, cookies, customerId, "INVOICE", "2026-08-15");
    await createDocument(app, cookies, customerId, "INVOICE", "2026-08-25");

    const res = await request(app).get("/documents?dateFrom=2026-08-10&dateTo=2026-08-20").set("Cookie", cookies);

    expect(res.body.total).toBe(1);
  });

  it("combines search with a type filter", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId, "INVOICE");
    await createDocument(app, cookies, customerId, "QUOTE");

    const res = await request(app).get("/documents?type=INVOICE&search=Musanze").set("Cookie", cookies);

    expect(res.body.total).toBe(1);
  });

  it("does not return another business's documents", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    await createDocument(app, cookies, customerId);

    const otherRes = await request(app).post("/auth/register").send({
      email: "other@example.com",
      password: "Supersecret1!",
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).get("/documents?type=INVOICE").set("Cookie", otherCookies);
    expect(res.body.total).toBe(0);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/documents?type=INVOICE");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/routes/documents.list.test.ts`
Expected: FAIL on the new type-list, date-range, and combined-search tests (the route still treats `type` as a single required value and ignores `dateFrom`/`dateTo`).

- [ ] **Step 3: Update the route**

In `server/src/routes/documents.ts`, replace the `where` construction inside the `GET /` handler:

```ts
  const where: Prisma.DocumentWhereInput = {
    businessId,
    type: query.type,
    ...(query.search
      ? {
          OR: [
            { number: { contains: query.search, mode: "insensitive" } },
            { customer: { name: { contains: query.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
```

with:

```ts
  const where: Prisma.DocumentWhereInput = {
    businessId,
    ...(query.type && query.type.length > 0 ? { type: { in: query.type } } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          issueDate: {
            ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
            ...(query.dateTo ? { lt: new Date(new Date(query.dateTo).getTime() + 24 * 60 * 60 * 1000) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { number: { contains: query.search, mode: "insensitive" } },
            { customer: { name: { contains: query.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd server && npx vitest run src/routes/documents.list.test.ts`
Expected: PASS, all 10 tests.

- [ ] **Step 5: Run the full server suite and typecheck**

Run: `cd server && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/documents.ts server/src/routes/documents.list.test.ts
git commit -m "support multi-type and date range filtering on GET /documents"
```

---

### Task 3: `Documents.tsx` unified "All documents" mode

**Files:**
- Modify: `client/src/pages/Documents.tsx`
- Modify: `client/src/pages/Documents.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `client/src/pages/Documents.test.tsx`, add a second render helper after `renderDocuments`:

```tsx
function renderAllDocuments() {
  return render(
    <MemoryRouter initialEntries={["/documents"]}>
      <AuthProvider>
        <Routes>
          <Route path="/documents" element={<Documents />} />
          <Route path="/documents/new" element={<div>new document page</div>} />
          <Route path="/documents/:id/edit" element={<div>edit document page</div>} />
          <Route path="/documents/:id" element={<div>view document page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}
```

Add these tests inside the existing `describe("Documents", ...)` block, after the last test:

```tsx
  it("shows a Type column and no New-document button in unified mode", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/documents")) {
        return new Response(
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
              {
                id: "d2",
                type: "PROFORMA",
                number: "PRO-0001",
                status: "FINALIZED",
                issueDate: "2026-08-18T00:00:00.000Z",
                total: 3000,
                customer: { name: "Musanze Supplies" },
              },
            ],
            total: 2,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderAllDocuments();

    expect(await screen.findByText("Invoice")).toBeInTheDocument();
    expect(screen.getByText("Proforma invoice")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^new /i })).not.toBeInTheDocument();
  });

  it("narrows results by type when a chip is toggled on", async () => {
    const calls: string[] = [];
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      calls.push(url);
      return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
    });
    const user = userEvent.setup();
    renderAllDocuments();
    await screen.findByText(/no documents yet/i);

    await user.click(screen.getByRole("button", { name: /^invoices$/i }));

    await waitFor(() => {
      const url = new URL(calls[calls.length - 1], "http://localhost");
      expect(url.searchParams.get("type")).toBe("INVOICE");
    });
  });

  it("adds to the type filter when a second chip is toggled on", async () => {
    const calls: string[] = [];
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      calls.push(url);
      return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
    });
    const user = userEvent.setup();
    renderAllDocuments();
    await screen.findByText(/no documents yet/i);

    await user.click(screen.getByRole("button", { name: /^invoices$/i }));
    await user.click(screen.getByRole("button", { name: /^proforma invoices$/i }));

    await waitFor(() => {
      const url = new URL(calls[calls.length - 1], "http://localhost");
      expect(url.searchParams.get("type")).toBe("INVOICE,PROFORMA");
    });
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/Documents.test.tsx`
Expected: FAIL on the 3 new tests (no Type column, no chips, "New invoice" button always renders today since `type` always defaults to `"INVOICE"`).

- [ ] **Step 3: Write the implementation**

Replace the full contents of `client/src/pages/Documents.tsx`:

```tsx
import { useState } from "react";
import { DOCUMENT_TYPES, type DocumentType } from "@billa/shared";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "../components/AppLayout";
import { usePaginatedList } from "../lib/usePaginatedList";
import { formatRwf } from "@billa/shared";
import { API_BASE_URL } from "../lib/apiClient";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";

interface DocumentRow {
  id: string;
  type: DocumentType;
  number: string | null;
  status: "DRAFT" | "FINALIZED";
  issueDate: string;
  total: number;
  customer: { name: string };
}

type SortBy = "issueDate" | "total" | "createdAt";

export default function Documents() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const typeParam = searchParams.get("type") as DocumentType | null;
  const isUnified = typeParam === null;
  const labels = typeParam ? DOCUMENT_TYPE_LABELS[typeParam] : null;
  const [selectedTypes, setSelectedTypes] = useState<DocumentType[]>([]);

  const extraParams: Record<string, string> = {};
  if (typeParam) {
    extraParams.type = typeParam;
  } else if (selectedTypes.length > 0) {
    extraParams.type = selectedTypes.join(",");
  }

  const list = usePaginatedList<DocumentRow, SortBy>({
    resourcePath: "/documents",
    defaultSortBy: "createdAt",
    extraParams,
  });

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const heading = isUnified ? "All documents" : labels!.plural;
  const searchPlaceholder = isUnified ? "Search documents" : `Search ${labels!.plural.toLowerCase()}`;
  const emptyText = isUnified ? "No documents yet." : `No ${labels!.plural.toLowerCase()} yet.`;
  const loadingLabel = isUnified ? "Loading documents" : `Loading ${labels!.plural.toLowerCase()}`;

  function openDocument(document: DocumentRow) {
    if (document.status === "DRAFT") {
      navigate(`/documents/${document.id}/edit`);
    } else {
      navigate(`/documents/${document.id}`);
    }
  }

  function toggleType(type: DocumentType) {
    setSelectedTypes((current) => (current.includes(type) ? current.filter((t) => t !== type) : [...current, type]));
    list.setPage(1);
  }

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-neutral-900">{heading}</h1>
          {!isUnified && (
            <button
              type="button"
              onClick={() => navigate(`/documents/new?type=${typeParam}`)}
              className="flex w-auto items-center justify-center rounded-lg bg-primary-500 px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
            >
              New {labels!.singular}
            </button>
          )}
        </div>

        {isUnified && (
          <div className="flex flex-wrap gap-2">
            {DOCUMENT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                className={`rounded-full border px-3 py-1 font-sans text-sm transition-colors ${
                  selectedTypes.includes(type)
                    ? "border-primary-500 bg-primary-50 text-primary-700"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {DOCUMENT_TYPE_LABELS[type].plural}
              </button>
            ))}
          </div>
        )}

        <input
          type="text"
          placeholder={searchPlaceholder}
          value={list.search}
          onChange={(event) => list.updateSearch(event.target.value)}
          className="w-full max-w-xs rounded-lg border border-neutral-200 px-3.5 py-2 font-sans text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />

        {list.error && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {list.error}
          </div>
        )}

        {list.isLoading ? (
          <div className="flex flex-col gap-2" aria-label={loadingLabel}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-100" />
            ))}
          </div>
        ) : list.results.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
            <p className="font-sans text-sm text-neutral-600">{emptyText}</p>
            {!isUnified && (
              <button
                type="button"
                onClick={() => navigate(`/documents/new?type=${typeParam}`)}
                className="flex w-auto items-center justify-center rounded-lg bg-primary-500 px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
              >
                New {labels!.singular}
              </button>
            )}
          </div>
        ) : (
          <table className="w-full border-collapse font-sans text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="cursor-pointer py-2" onClick={() => list.toggleSort("issueDate")}>
                  Date {list.sortBy === "issueDate" && (list.sortOrder === "asc" ? "↑" : "↓")}
                </th>
                {isUnified && <th className="py-2">Type</th>}
                <th className="py-2">Number</th>
                <th className="py-2">Customer</th>
                <th className="cursor-pointer py-2" onClick={() => list.toggleSort("total")}>
                  Total {list.sortBy === "total" && (list.sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th className="py-2">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {list.results.map((document) => (
                <tr
                  key={document.id}
                  onClick={() => openDocument(document)}
                  className="cursor-pointer border-b border-neutral-100 hover:bg-neutral-50"
                >
                  <td className="py-3">{document.issueDate.slice(0, 10)}</td>
                  {isUnified && (
                    <td className="py-3 text-neutral-600">{DOCUMENT_TYPE_LABELS[document.type].singular}</td>
                  )}
                  <td className="py-3">{document.number ?? "Draft"}</td>
                  <td className="py-3 text-neutral-600">{document.customer.name}</td>
                  <td className="py-3 text-neutral-600">{formatRwf(document.total)}</td>
                  <td className="py-3 text-neutral-600">{document.status}</td>
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        window.open(`${API_BASE_URL}/documents/${document.id}/pdf`, "_blank");
                      }}
                      className="font-sans text-sm text-primary-500 hover:text-primary-700"
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!list.isLoading && list.results.length > 0 && (
          <div className="flex items-center justify-between font-sans text-sm text-neutral-600">
            <span>
              Page {list.page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={list.page <= 1}
                onClick={() => list.setPage(list.page - 1)}
                className="disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={list.page >= totalPages}
                onClick={() => list.setPage(list.page + 1)}
                className="disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd client && npx vitest run src/pages/Documents.test.tsx`
Expected: PASS, all 8 tests (the 5 pre-existing tests plus the 3 new ones).

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Documents.tsx client/src/pages/Documents.test.tsx
git commit -m "add a unified All documents view with multi-select type filter chips"
```

---

### Task 4: Date range filter

**Files:**
- Modify: `client/src/pages/Documents.tsx`
- Modify: `client/src/pages/Documents.test.tsx`

- [ ] **Step 1: Write the failing test**

In `client/src/pages/Documents.test.tsx`, change the top import line:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
```

to:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
```

Add this test inside the existing `describe("Documents", ...)` block, after the last test:

```tsx
  it("sends dateFrom and dateTo when the date range is set", async () => {
    const calls: string[] = [];
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      calls.push(url);
      return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
    });
    renderDocuments();
    await screen.findByText(/no invoices yet/i);

    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-08-31" } });

    await waitFor(() => {
      const url = new URL(calls[calls.length - 1], "http://localhost");
      expect(url.searchParams.get("dateFrom")).toBe("2026-08-01");
      expect(url.searchParams.get("dateTo")).toBe("2026-08-31");
    });
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/Documents.test.tsx`
Expected: FAIL — there's no element with label "From date" or "To date" yet.

- [ ] **Step 3: Write the implementation**

In `client/src/pages/Documents.tsx`, add two pieces of state right after `const [selectedTypes, setSelectedTypes] = useState<DocumentType[]>([]);`:

```tsx
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
```

Extend the `extraParams` construction, right after the `type` handling:

```tsx
  const extraParams: Record<string, string> = {};
  if (typeParam) {
    extraParams.type = typeParam;
  } else if (selectedTypes.length > 0) {
    extraParams.type = selectedTypes.join(",");
  }
  if (dateFrom) extraParams.dateFrom = dateFrom;
  if (dateTo) extraParams.dateTo = dateTo;
```

Replace the bare search `<input>` with a row containing the search box and the date range:

```tsx
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={list.search}
          onChange={(event) => list.updateSearch(event.target.value)}
          className="w-full max-w-xs rounded-lg border border-neutral-200 px-3.5 py-2 font-sans text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
```

with:

```tsx
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={list.search}
            onChange={(event) => list.updateSearch(event.target.value)}
            className="w-full max-w-xs rounded-lg border border-neutral-200 px-3.5 py-2 font-sans text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="From date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                list.setPage(1);
              }}
              className="rounded-lg border border-neutral-200 px-3 py-2 font-sans text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
            <span className="font-sans text-sm text-neutral-400">to</span>
            <input
              type="date"
              aria-label="To date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                list.setPage(1);
              }}
              className="rounded-lg border border-neutral-200 px-3 py-2 font-sans text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </div>
        </div>
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd client && npx vitest run src/pages/Documents.test.tsx`
Expected: PASS, all 9 tests.

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Documents.tsx client/src/pages/Documents.test.tsx
git commit -m "add a date range filter to document list pages"
```

---

### Task 5: "All documents" nav link

**Files:**
- Modify: `client/src/components/AppLayout.tsx`

No dedicated test file exists for `AppLayout.tsx` (nav links added in earlier stages weren't unit-tested there either); this change is covered by the full client suite (regression) and by real-browser verification in Task 6.

- [ ] **Step 1: Add the link**

In `client/src/components/AppLayout.tsx`, change:

```tsx
        <nav className="flex items-center gap-6">
          {DOCUMENT_TYPES.map((type) => (
```

to:

```tsx
        <nav className="flex items-center gap-6">
          <Link to="/documents" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
            All documents
          </Link>
          {DOCUMENT_TYPES.map((type) => (
```

- [ ] **Step 2: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors. (Every existing test that renders `AppLayout` only queries for specific text/roles it cares about, so an added nav link doesn't break anything.)

- [ ] **Step 3: Commit**

```bash
git add client/src/components/AppLayout.tsx
git commit -m "add an All documents nav link"
```

---

### Task 6: Full suite, typecheck, and real-browser verification

**Files:** none (verification only)

- [ ] **Step 1: Run every workspace's test suite**

Run: `cd shared && npm test && cd ../server && npm test && cd ../client && npm test`
Expected: all pass.

- [ ] **Step 2: Typecheck every workspace**

Run: `cd shared && npm run typecheck && cd ../server && npm run typecheck && cd ../client && npm run typecheck`
Expected: no errors in any workspace.

- [ ] **Step 3: Real-browser verification**

Using an existing test account with a mix of finalized/draft documents across at least 2 types (create more via the UI or the API if needed):

1. Click "All documents" in the nav. Confirm it shows a Type column and documents of every type mixed together, sorted by the default column.
2. Confirm there's no "New document" button anywhere on this page.
3. Click a type chip (e.g. "Invoices"). Confirm the list narrows to just that type and the chip shows a selected state.
4. Click a second chip (e.g. "Proforma invoices"). Confirm the list now shows both types together, not just the second one.
5. Click the first chip again to deselect it. Confirm the list updates to show only the remaining selected type.
6. Deselect all chips. Confirm the list returns to showing every type.
7. Set a From date and a To date. Confirm the list narrows to documents issued within that range, inclusive of both endpoints.
8. Navigate to a type-specific page (e.g. "Invoices" in the nav). Confirm it looks and behaves exactly as before: no Type column, no chips, "New invoice" button present, and the same search box plus the new date range filter.
9. Check the browser's console and network tab for unexpected errors during all of the above.

- [ ] **Step 4: Fix any issues found**

If real-browser verification finds bugs, fix them, add or update the relevant test(s) to cover what was missed, re-run that test file to confirm it passes, then commit the fix as its own commit.

- [ ] **Step 5: Final confirmation**

Once every workspace's suite passes, every workspace typechecks, and manual verification found no outstanding issues, this stage is done.

---

## Self-review notes

- **Spec coverage:** server-side optional multi-type filter (Task 1, 2), date range filtering (Task 1, 2), unified view with Type column and chips (Task 3), hidden create button in unified mode (Task 3), date range UI in both modes (Task 4), nav link (Task 5), and the "per-type mode is unchanged" guarantee (verified by the untouched pre-existing tests in Task 3 and 4 still passing) are all covered.
- **Placeholder scan:** no TBD/TODO; every step shows real code or an exact command.
- **Type consistency:** `DocumentRow.type: DocumentType` (Task 3) matches the `type` field Prisma already returns on every document row (no server change needed for this, since `include` only adds relations on top of the existing scalar fields). The `type` query param's array shape from Task 1's schema (`DocumentType[] | undefined`) matches how Task 2's route consumes `query.type` (`{ in: query.type }`). The `extraParams.type` string built in Task 3/4 (`typeParam` or `selectedTypes.join(",")`) matches what Task 1's schema parses back into an array server-side.
