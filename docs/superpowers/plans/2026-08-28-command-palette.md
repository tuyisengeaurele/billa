# Global Search / Command Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a business-app user jump straight to a customer, item, or document from anywhere via a `Cmd/Ctrl+K` palette or a visible "Search... ⌘K" pill in the top bar.

**Architecture:** One new server route (`GET /search`) fans out three capped, business-scoped Prisma queries in parallel and returns a flat, typed result list. One new client component (`SearchPalette`) renders that list in a keyboard-navigable overlay, opened by a trigger pill or the global shortcut wired into `AppLayout`.

**Tech Stack:** Express + Zod + Prisma (server, matching every other list route's pattern exactly); React + framer-motion + react-router-dom (client, matching `Modal.tsx`'s existing visual idiom).

**Design doc:** `docs/superpowers/specs/2026-08-28-command-palette-design.md` — read it first for *why*; this plan covers *how*.

---

## Before you start

Read `client/src/components/Modal.tsx`, `client/src/lib/usePaginatedList.ts` (specifically its debounce/cancellation pattern, lines ~35–69), and `server/src/routes/items.ts`. This plan's new code deliberately copies all three rather than inventing new patterns.

---

### Task 1: `search-schemas.ts` in the shared package

**Files:**
- Create: `shared/src/search-schemas.ts`
- Test: `shared/src/search-schemas.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { searchQuerySchema } from "./search-schemas.js";

describe("searchQuerySchema", () => {
  it("accepts a query of 2 or more characters", () => {
    expect(searchQuerySchema.safeParse({ q: "ac" }).success).toBe(true);
  });

  it("rejects a query shorter than 2 characters", () => {
    expect(searchQuerySchema.safeParse({ q: "a" }).success).toBe(false);
  });

  it("rejects a missing q", () => {
    expect(searchQuerySchema.safeParse({}).success).toBe(false);
  });

  it("trims whitespace before checking length", () => {
    expect(searchQuerySchema.safeParse({ q: " a " }).success).toBe(false);
    expect(searchQuerySchema.parse({ q: " ac " }).q).toBe("ac");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shared && npx vitest run src/search-schemas.test.ts`
Expected: FAIL — `Cannot find module './search-schemas.js'`

- [ ] **Step 3: Write the implementation**

```ts
import { z } from "zod";

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;
```

- [ ] **Step 4: Export it from the package index**

In `shared/src/index.ts`, add (anywhere in the list, alphabetical-ish grouping isn't strictly enforced by the existing file, so append at the end):

```ts
export * from "./search-schemas.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd shared && npx vitest run src/search-schemas.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Build the shared package so the server/client workspaces pick up the change**

Run: `cd shared && npm run typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add shared/src/search-schemas.ts shared/src/search-schemas.test.ts shared/src/index.ts
git commit -m "add the search query schema to the shared package"
```

---

### Task 2: `GET /search` server route

**Files:**
- Create: `server/src/routes/search.ts`
- Test: `server/src/routes/search.test.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Write the failing test**

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

async function registerAndGetCookies(app: ReturnType<typeof createApp>, email = "owner@example.com") {
  const res = await request(app)
    .post("/auth/session")
    .send({ idToken: JSON.stringify({ uid: email, email }), businessName: "Kigali Traders" });
  return res.headers["set-cookie"] as unknown as string[];
}

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[], name: string) {
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name });
  return res.body.customer.id as string;
}

async function createItem(app: ReturnType<typeof createApp>, cookies: string[], description: string) {
  await request(app)
    .post("/items")
    .set("Cookie", cookies)
    .send({ description, unitPrice: 1000, unit: "piece" });
}

async function createDocument(app: ReturnType<typeof createApp>, cookies: string[], customerId: string) {
  const res = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-19",
      lines: [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }],
    });
  return res.body.document.id as string;
}

describe("GET /search", () => {
  it("returns matching customers, items, and documents grouped by type", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, "Kigali Traders");
    await createItem(app, cookies, "Kigali printing service");
    const documentId = await createDocument(app, cookies, customerId);

    const res = await request(app).get("/search?q=kigali").set("Cookie", cookies);

    expect(res.status).toBe(200);
    const types = res.body.results.map((r: { type: string }) => r.type);
    expect(types).toContain("customer");
    expect(types).toContain("item");
    expect(types).toContain("document");
    const customerResult = res.body.results.find((r: { type: string }) => r.type === "customer");
    expect(customerResult).toMatchObject({ id: customerId, label: "Kigali Traders", href: `/customers/${customerId}/statement` });
    const documentResult = res.body.results.find((r: { type: string }) => r.type === "document");
    expect(documentResult).toMatchObject({ id: documentId, documentType: "INVOICE", href: `/documents/${documentId}` });
  });

  it("matches a document by its customer's name, not just its own number", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies, "Musanze Supplies");
    await createDocument(app, cookies, customerId);

    const res = await request(app).get("/search?q=musanze").set("Cookie", cookies);

    expect(res.body.results.some((r: { type: string }) => r.type === "document")).toBe(true);
  });

  it("does not return another business's data", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app, "owner@example.com");
    await createCustomer(app, cookies, "Kigali Traders");

    const otherCookies = await registerAndGetCookies(app, "other@example.com");
    const res = await request(app).get("/search?q=kigali").set("Cookie", otherCookies);

    expect(res.body.results).toHaveLength(0);
  });

  it("rejects a query shorter than 2 characters", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).get("/search?q=k").set("Cookie", cookies);

    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/search?q=kigali");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/routes/search.test.ts`
Expected: FAIL — 404s, since `/search` isn't registered yet

- [ ] **Step 3: Write the implementation**

```ts
import { Router } from "express";
import { formatRwf, searchQuerySchema } from "@billa/shared";
import type { SearchQuery } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireActiveSubscription } from "../middleware/require-active-subscription.js";
import { validateQuery } from "../middleware/validate-query.js";

export const searchRouter = Router();

searchRouter.use(requireAuth);
searchRouter.use(requireActiveSubscription);

const RESULT_LIMIT = 5;

searchRouter.get("/", validateQuery(searchQuerySchema), async (req, res) => {
  const { q } = req.listQuery as SearchQuery;
  const businessId = req.auth!.businessId;

  const [customers, items, documents] = await Promise.all([
    prisma.customer.findMany({
      where: { businessId, name: { contains: q, mode: "insensitive" } },
      take: RESULT_LIMIT,
      orderBy: { name: "asc" },
    }),
    prisma.item.findMany({
      where: { businessId, description: { contains: q, mode: "insensitive" } },
      take: RESULT_LIMIT,
      orderBy: { description: "asc" },
    }),
    prisma.document.findMany({
      where: {
        businessId,
        OR: [
          { number: { contains: q, mode: "insensitive" } },
          { customer: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      take: RESULT_LIMIT,
      orderBy: { issueDate: "desc" },
      include: { customer: { select: { name: true } } },
    }),
  ]);

  const results = [
    ...customers.map((c) => ({
      type: "customer" as const,
      id: c.id,
      label: c.name,
      sublabel: c.phone ?? c.email ?? "",
      href: `/customers/${c.id}/statement`,
    })),
    ...items.map((i) => ({
      type: "item" as const,
      id: i.id,
      label: i.description,
      sublabel: formatRwf(i.unitPrice),
      href: "/items",
    })),
    ...documents.map((d) => ({
      type: "document" as const,
      id: d.id,
      label: d.number ?? "Draft",
      sublabel: d.customer.name,
      documentType: d.type,
      href: `/documents/${d.id}`,
    })),
  ];

  res.json({ results });
});
```

- [ ] **Step 4: Register the route**

In `server/src/app.ts`, add the import next to the other resource-router imports:

```ts
import { documentsRouter } from "./routes/documents.js";
import { searchRouter } from "./routes/search.js";
```

and the registration right after documents:

```ts
  app.use("/documents", documentsRouter);
  app.use("/search", searchRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run src/routes/search.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/search.ts server/src/routes/search.test.ts server/src/app.ts
git commit -m "add the GET /search route"
```

---

### Task 3: `SearchPaletteTrigger` component

**Files:**
- Create: `client/src/components/SearchPaletteTrigger.tsx`
- Test: `client/src/components/SearchPaletteTrigger.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchPaletteTrigger } from "./SearchPaletteTrigger";

describe("SearchPaletteTrigger", () => {
  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<SearchPaletteTrigger onClick={onClick} />);

    await user.click(screen.getByRole("button", { name: /search/i }));

    expect(onClick).toHaveBeenCalled();
  });

  it("shows a keyboard shortcut hint", () => {
    render(<SearchPaletteTrigger onClick={vi.fn()} />);

    expect(screen.getByText(/K$/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/SearchPaletteTrigger.test.tsx`
Expected: FAIL — `Cannot find module './SearchPaletteTrigger'`

- [ ] **Step 3: Write the implementation**

```tsx
import { forwardRef } from "react";

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform ?? navigator.userAgent;
  return /Mac|iPhone|iPad/.test(platform);
}

interface SearchPaletteTriggerProps {
  onClick: () => void;
}

export const SearchPaletteTrigger = forwardRef<HTMLButtonElement, SearchPaletteTriggerProps>(
  function SearchPaletteTrigger({ onClick }, ref) {
    const shortcutLabel = isMacPlatform() ? "⌘K" : "Ctrl+K";

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-label="Search customers, items, and documents"
        className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-1.5 font-sans text-sm text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-700"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path strokeLinecap="round" d="m20 20-3.5-3.5" />
        </svg>
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-sans text-xs text-neutral-400 sm:inline-block">
          {shortcutLabel}
        </kbd>
      </button>
    );
  },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/SearchPaletteTrigger.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/SearchPaletteTrigger.tsx client/src/components/SearchPaletteTrigger.test.tsx
git commit -m "add the search palette trigger pill"
```

---

### Task 4: `SearchPalette` component

**Files:**
- Create: `client/src/components/SearchPalette.tsx`
- Test: `client/src/components/SearchPalette.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchPalette } from "./SearchPalette";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderPalette(onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <SearchPalette isOpen onClose={onClose} />
              <p>underlying page</p>
            </>
          }
        />
        <Route path="/customers/:id/statement" element={<p>customer statement page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SearchPalette", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows a hint before 2 characters are typed, and does not call the API", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByRole("textbox"), "k");

    expect(screen.getByText(/search customers, items, and documents/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows grouped results once the query resolves", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/search")) {
        return new Response(
          JSON.stringify({
            results: [
              { type: "customer", id: "c1", label: "Kigali Traders", sublabel: "0788000000", href: "/customers/c1/statement" },
              { type: "document", id: "d1", label: "INV-0001", sublabel: "Kigali Traders", documentType: "INVOICE", href: "/documents/d1" },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByRole("textbox"), "kigali");

    expect(await screen.findByText("Customers")).toBeInTheDocument();
    expect(screen.getByText("Kigali Traders")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("INV-0001")).toBeInTheDocument();
    expect(screen.getByText(/invoice · kigali traders/i)).toBeInTheDocument();
  });

  it("navigates to a result and closes when Enter is pressed", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          results: [{ type: "customer", id: "c1", label: "Kigali Traders", sublabel: "", href: "/customers/c1/statement" }],
        }),
        { status: 200 },
      ),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPalette(onClose);

    await user.type(screen.getByRole("textbox"), "kigali");
    await screen.findByText("Kigali Traders");
    await user.keyboard("{Enter}");

    expect(await screen.findByText("customer statement page")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPalette(onClose);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("shows a no-results message for a query that matches nothing", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }));
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByRole("textbox"), "zzz");

    expect(await screen.findByText(/no results for "zzz"/i)).toBeInTheDocument();
  });

  it("discards a stale response superseded by a newer query", async () => {
    let resolveFirst: (value: Response) => void = () => {};
    const firstPromise = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("q=ab")) return firstPromise;
      return new Response(
        JSON.stringify({ results: [{ type: "item", id: "i1", label: "Second query result", sublabel: "", href: "/items" }] }),
        { status: 200 },
      );
    });
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByRole("textbox"), "ab");
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await user.type(screen.getByRole("textbox"), "c");
    await screen.findByText("Second query result");

    // The first request resolves late, after the second one already rendered.
    resolveFirst(
      new Response(
        JSON.stringify({ results: [{ type: "item", id: "stale", label: "Stale result", sublabel: "", href: "/items" }] }),
        { status: 200 },
      ),
    );

    expect(screen.queryByText("Stale result")).not.toBeInTheDocument();
    expect(screen.getByText("Second query result")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/SearchPalette.test.tsx`
Expected: FAIL — `Cannot find module './SearchPalette'`

- [ ] **Step 3: Write the implementation**

```tsx
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { DocumentType } from "@billa/shared";
import { apiRequest } from "../lib/apiClient";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";

interface SearchResult {
  type: "customer" | "item" | "document";
  id: string;
  label: string;
  sublabel: string;
  documentType?: DocumentType;
  href: string;
}

interface SearchPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const SECTION_ORDER = ["customer", "item", "document"] as const;
const SECTION_LABELS: Record<SearchResult["type"], string> = {
  customer: "Customers",
  item: "Items",
  document: "Documents",
};

function resultSublabel(result: SearchResult): string {
  if (result.type === "document" && result.documentType) {
    return `${DOCUMENT_TYPE_LABELS[result.documentType].singular} · ${result.sublabel}`;
  }
  return result.sublabel;
}

export function SearchPalette({ isOpen, onClose }: SearchPaletteProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setResults([]);
    setSelectedIndex(0);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    const timeout = setTimeout(() => {
      apiRequest<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(trimmed)}`)
        .then((data) => {
          if (cancelled) return;
          setResults(data.results);
          setSelectedIndex(0);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, isOpen]);

  function goToResult(result: SearchResult) {
    navigate(result.href);
    onClose();
  }

  function handleKeyDown(event: ReactKeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => (results.length === 0 ? 0 : (current + 1) % results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => (results.length === 0 ? 0 : (current - 1 + results.length) % results.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = results[selectedIndex];
      if (selected) goToResult(selected);
    } else if (event.key === "Escape") {
      onClose();
    }
  }

  const trimmedQuery = query.trim();

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 pt-24 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0 text-neutral-400">
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search customers, items, and documents"
                aria-label="Search customers, items, and documents"
                className="flex-1 bg-transparent font-sans text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
              />
            </div>

            <div className="overflow-y-auto" role="listbox" aria-label="Search results">
              {trimmedQuery.length < 2 ? (
                <p className="px-4 py-8 text-center font-sans text-sm text-neutral-500">
                  Search customers, items, and documents.
                </p>
              ) : isLoading ? (
                <p className="px-4 py-8 text-center font-sans text-sm text-neutral-500">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-4 py-8 text-center font-sans text-sm text-neutral-500">No results for "{trimmedQuery}"</p>
              ) : (
                SECTION_ORDER.map((type) => {
                  const section = results.filter((r) => r.type === type);
                  if (section.length === 0) return null;
                  return (
                    <div key={type} className="py-2">
                      <p className="px-4 py-1 font-sans text-xs font-medium uppercase tracking-wide text-neutral-400">
                        {SECTION_LABELS[type]}
                      </p>
                      {section.map((result) => {
                        const index = results.indexOf(result);
                        const isSelected = index === selectedIndex;
                        return (
                          <button
                            key={result.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => goToResult(result)}
                            onMouseEnter={() => setSelectedIndex(index)}
                            className={`flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left font-sans text-sm transition-colors ${
                              isSelected ? "bg-primary-100 text-primary-700" : "text-neutral-900 hover:bg-neutral-50"
                            }`}
                          >
                            <span className="font-medium">{result.label}</span>
                            <span className="text-xs text-neutral-500">{resultSublabel(result)}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/SearchPalette.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/SearchPalette.tsx client/src/components/SearchPalette.test.tsx
git commit -m "add the SearchPalette overlay"
```

---

### Task 5: Wire the palette into `AppLayout`

**Files:**
- Modify: `client/src/components/AppLayout.tsx`
- Modify: `client/src/components/AppLayout.test.tsx`

- [ ] **Step 1: Add the imports**

```tsx
import { useEffect, useRef, useState } from "react";
```

(replaces the existing `import { useEffect, useState } from "react";` — add `useRef`)

```tsx
import { SearchPalette } from "./SearchPalette";
import { SearchPaletteTrigger } from "./SearchPaletteTrigger";
```

- [ ] **Step 2: Add state, the global shortcut listener, and a close handler that returns focus**

Find:

```tsx
  const [billingBanner, setBillingBanner] = useState<string | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isReturningToAdmin, setIsReturningToAdmin] = useState(false);

  useEffect(() => {
```

Replace with:

```tsx
  const [billingBanner, setBillingBanner] = useState<string | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isReturningToAdmin, setIsReturningToAdmin] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function closeSearch() {
    setIsSearchOpen(false);
    searchTriggerRef.current?.focus();
  }

  useEffect(() => {
```

- [ ] **Step 3: Mount the palette and the trigger**

Find:

```tsx
        <ImpersonationRequestModal />
        <IdleTimeoutModal />
        <ProductTourModal />
```

Replace with:

```tsx
        <ImpersonationRequestModal />
        <IdleTimeoutModal />
        <ProductTourModal />
        <SearchPalette isOpen={isSearchOpen} onClose={closeSearch} />
```

Find:

```tsx
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <NotificationBell allHref="/notifications" />
                <UserMenu profileHref="/profile" logoutConfirmMessage="Log out of Billa?" />
              </div>
```

Replace with:

```tsx
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <SearchPaletteTrigger ref={searchTriggerRef} onClick={() => setIsSearchOpen(true)} />
                <NotificationBell allHref="/notifications" />
                <UserMenu profileHref="/profile" logoutConfirmMessage="Log out of Billa?" />
              </div>
```

- [ ] **Step 4: Add a test for the keyboard shortcut**

Open `client/src/components/AppLayout.test.tsx`. It already has a `renderAppLayout()` helper (wraps `AppLayout` in `MemoryRouter` + `AuthProvider`) and an established per-test pattern of mocking `fetch` to return an unauthenticated 401 when the test doesn't care about `/billing/status`'s data (see the existing "renders nav links and children" test). Add, inside the existing `describe("AppLayout", ...)` block:

```tsx
  it("opens the search palette on Cmd/Ctrl+K", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderAppLayout();
    await screen.findByText("page content");

    await user.keyboard("{Meta>}k{/Meta}");

    expect(await screen.findByRole("dialog", { name: /search/i })).toBeInTheDocument();
  });
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd client && npx vitest run src/components/AppLayout.test.tsx`
Expected: PASS, including the new test

- [ ] **Step 6: Run every existing test file that renders AppLayout, to catch fallout**

Run: `cd client && grep -rl "AppLayout" src --include=*.test.tsx`

Run vitest on that file list. `SearchPalette` and `SearchPaletteTrigger` should be inert (closed, no visible dialog) unless a test explicitly presses the shortcut, so nothing else should break — but confirm rather than assume.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/AppLayout.tsx client/src/components/AppLayout.test.tsx
git commit -m "wire the search palette into the app shell with a Cmd/Ctrl+K shortcut"
```

---

### Task 6: Final verification

- [ ] **Step 1: Type-check both workspaces**

Run: `cd shared && npm run typecheck`
Run: `cd server && npm run typecheck`
Run: `cd client && npx tsc --noEmit`
Expected: no errors in any of the three

- [ ] **Step 2: Full test suites**

Run: `cd server && npx vitest run`
Run: `cd client && npx vitest run`
Expected: all green. Per this project's established pattern, if a handful of unrelated tests fail on a full parallel run but pass individually, re-run that specific file in isolation before treating it as a real regression from this plan.

- [ ] **Step 3: Manual spot-check with the browser preview**

Start the dev server preview. If a session is already authenticated in this environment, exercise the palette directly (do not create a new account or enter credentials, per this environment's standing rules):
- Press `Cmd/Ctrl+K` from a few different pages and confirm it opens.
- Type a known customer/item/document name and confirm grouped results appear.
- Arrow down/up through results, press Enter, confirm navigation lands on the right page and the palette closes.
- Press Escape and confirm focus returns visibly to the trigger pill.
- Resize to a narrow/mobile viewport and confirm the trigger shrinks to icon-only without crowding the header, and the palette itself doesn't overflow the screen.

- [ ] **Step 4: Update project memory**

Add a `project` memory entry recording what shipped, following the format used for the toast system (`project_toast_system_2026_08_28.md`) and the 2026-08-27 batch — this closes out all three items from the original 2026-08-28 UI/UX brainstorm.
