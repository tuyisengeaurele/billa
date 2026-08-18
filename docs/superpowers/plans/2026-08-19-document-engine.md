# Document Engine (Invoice First) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A generic document CRUD system (header + line items, draft/finalize lifecycle, sequential numbering on finalize) built to work for all 5 document types, with only the invoice UI surfaced this stage.

**Architecture:** One generic `documents` resource on both server and client, parameterized by `type`. Whole-document save (client sends the full header + line array each time; server replaces all lines and recomputes totals atomically). Totals are always server-computed. Numbering happens only at finalize, inside a transaction against the existing `DocumentSequence` table.

**Tech Stack:** Express, Prisma (new migration needed), Zod, React, react-hook-form (`useFieldArray` for line items), React Router. No new dependencies.

**Reference:** `docs/superpowers/specs/2026-08-19-document-engine-design.md`

---

## File Structure

- Modify: `server/prisma/schema.prisma`: `Document.number` becomes nullable; new migration.
- Create: `shared/src/document-schemas.ts`: `documentLineSchema`, `documentSchema`, `documentListQuerySchema`.
- Create: `server/src/lib/document-totals.ts`: pure line/subtotal/tax/total calculation.
- Modify: `server/src/lib/document-sequences.ts`: export `DEFAULT_PREFIXES`.
- Create: `server/src/routes/documents.ts`: list, create, get, update, finalize, delete.
- Modify: `server/src/app.ts`: mount `documentsRouter`.
- Modify: `client/src/lib/usePaginatedList.ts`: add optional `extraParams`.
- Create: `client/src/lib/documentTypeLabels.ts`: type → display label map.
- Create: `client/src/components/SearchDropdown.tsx`: presentational search combobox.
- Create: `client/src/components/customers/CustomerPicker.tsx`.
- Create: `client/src/components/items/ItemPicker.tsx`.
- Create: `client/src/pages/DocumentForm.tsx`: create/edit page.
- Create: `client/src/pages/Documents.tsx`: list page.
- Create: `client/src/pages/DocumentView.tsx`: read-only page for finalized documents.
- Modify: `client/src/components/AppLayout.tsx`: add "Invoices" nav link.
- Modify: `client/src/App.tsx`: add document routes.

---

### Task 1: Prisma migration, Document.number nullable

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Make the field nullable**

In `server/prisma/schema.prisma`, change:

```prisma
model Document {
  ...
  number     String
  ...
}
```

to:

```prisma
model Document {
  ...
  number     String?
  ...
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npm run prisma:migrate --workspace=server -- --name document_number_nullable`
Expected: a new folder under `server/prisma/migrations/` and the command reports the migration applied successfully.

- [ ] **Step 3: Verify existing tests still pass**

Run: `npm run test --workspace=server`
Expected: PASS, all existing tests unaffected (no test currently asserts `number` is non-null in a way this breaks).

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "make Document.number nullable for the draft/finalize lifecycle"
```

---

### Task 2: Shared document schemas

**Files:**
- Create: `shared/src/document-schemas.ts`
- Test: `shared/src/document-schemas.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { documentLineSchema, documentListQuerySchema, documentSchema } from "./document-schemas.js";

describe("documentLineSchema", () => {
  it("accepts a valid line", () => {
    expect(
      documentLineSchema.safeParse({ description: "Printing", quantity: 2, unitPrice: 5000, taxRate: 18 }).success,
    ).toBe(true);
  });

  it("rejects a zero quantity", () => {
    expect(
      documentLineSchema.safeParse({ description: "Printing", quantity: 0, unitPrice: 5000, taxRate: 18 }).success,
    ).toBe(false);
  });

  it("rejects a tax rate over 100", () => {
    expect(
      documentLineSchema.safeParse({ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 150 }).success,
    ).toBe(false);
  });

  it("rejects a negative unit price", () => {
    expect(
      documentLineSchema.safeParse({ description: "Printing", quantity: 1, unitPrice: -1, taxRate: 18 }).success,
    ).toBe(false);
  });
});

describe("documentSchema", () => {
  it("accepts a document with no lines", () => {
    expect(
      documentSchema.safeParse({ type: "INVOICE", customerId: "c1", issueDate: "2026-08-19", lines: [] }).success,
    ).toBe(true);
  });

  it("rejects a missing customerId", () => {
    expect(documentSchema.safeParse({ type: "INVOICE", issueDate: "2026-08-19", lines: [] }).success).toBe(false);
  });

  it("rejects an unknown type", () => {
    expect(
      documentSchema.safeParse({ type: "BANANA", customerId: "c1", issueDate: "2026-08-19", lines: [] }).success,
    ).toBe(false);
  });
});

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

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=shared`
Expected: FAIL, `./document-schemas.js` does not exist.

- [ ] **Step 3: Implement**

```ts
import { z } from "zod";
import { DOCUMENT_TYPES } from "./document-types.js";

export const documentLineSchema = z.object({
  itemId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1, "Enter a description"),
  quantity: z.number({ invalid_type_error: "Enter a quantity" }).positive("Enter a quantity greater than zero"),
  unitPrice: z
    .number({ invalid_type_error: "Enter a price" })
    .int("Enter a whole number of RWF")
    .nonnegative("Price can't be negative"),
  taxRate: z
    .number({ invalid_type_error: "Enter a tax rate" })
    .min(0, "Tax rate can't be negative")
    .max(100, "Tax rate can't exceed 100%"),
});
export type DocumentLineInput = z.infer<typeof documentLineSchema>;

export const documentSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  customerId: z.string().trim().min(1, "Choose a customer"),
  issueDate: z.string().trim().min(1, "Choose an issue date"),
  dueDate: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  lines: z.array(documentLineSchema),
});
export type DocumentInput = z.infer<typeof documentSchema>;

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

Add to `shared/src/index.ts`: `export * from "./document-schemas.js";`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=shared`
Expected: PASS, all tests including the new ones.

- [ ] **Step 5: Commit**

```bash
git add shared/src/document-schemas.ts shared/src/document-schemas.test.ts shared/src/index.ts
git commit -m "add document shared schemas"
```

---

### Task 3: Server document totals helper

**Files:**
- Create: `server/src/lib/document-totals.ts`
- Test: `server/src/lib/document-totals.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { calculateDocumentTotals } from "./document-totals.js";

describe("calculateDocumentTotals", () => {
  it("computes line totals, subtotal, tax, and total", () => {
    const result = calculateDocumentTotals([
      { quantity: 2, unitPrice: 5000, taxRate: 18 },
      { quantity: 1, unitPrice: 1000, taxRate: 0 },
    ]);

    expect(result.lines[0]).toEqual({ lineTotal: 10000, taxAmount: 1800 });
    expect(result.lines[1]).toEqual({ lineTotal: 1000, taxAmount: 0 });
    expect(result.subtotal).toBe(11000);
    expect(result.taxTotal).toBe(1800);
    expect(result.total).toBe(12800);
  });

  it("returns zeros for an empty line list", () => {
    const result = calculateDocumentTotals([]);
    expect(result).toEqual({ lines: [], subtotal: 0, taxTotal: 0, total: 0 });
  });

  it("rounds fractional quantities to the nearest RWF", () => {
    const result = calculateDocumentTotals([{ quantity: 2.5, unitPrice: 1000, taxRate: 10 }]);
    expect(result.lines[0].lineTotal).toBe(2500);
    expect(result.lines[0].taxAmount).toBe(250);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server -- document-totals.test.ts`
Expected: FAIL, `./document-totals.js` does not exist.

- [ ] **Step 3: Implement**

```ts
export interface DocumentLineInput {
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export interface LineTotals {
  lineTotal: number;
  taxAmount: number;
}

export interface DocumentTotals {
  lines: LineTotals[];
  subtotal: number;
  taxTotal: number;
  total: number;
}

export function calculateDocumentTotals(lines: DocumentLineInput[]): DocumentTotals {
  const computed = lines.map((line) => {
    const lineTotal = Math.round(line.quantity * line.unitPrice);
    const taxAmount = Math.round(lineTotal * (line.taxRate / 100));
    return { lineTotal, taxAmount };
  });

  const subtotal = computed.reduce((sum, line) => sum + line.lineTotal, 0);
  const taxTotal = computed.reduce((sum, line) => sum + line.taxAmount, 0);

  return { lines: computed, subtotal, taxTotal, total: subtotal + taxTotal };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=server -- document-totals.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/document-totals.ts server/src/lib/document-totals.test.ts
git commit -m "add document totals calculation helper"
```

---

### Task 4: Documents routes, list + create + get

**Files:**
- Create: `server/src/routes/documents.ts`
- Test: `server/src/routes/documents.list.test.ts`
- Test: `server/src/routes/documents.create.test.ts`
- Test: `server/src/routes/documents.get.test.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Write the failing tests**

`server/src/routes/documents.list.test.ts`:

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
) {
  const res = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type,
      customerId,
      issueDate: "2026-08-19",
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

  it("rejects a missing type with 400", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).get("/documents").set("Cookie", cookies);
    expect(res.status).toBe(400);
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

`server/src/routes/documents.create.test.ts`:

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

describe("POST /documents", () => {
  it("creates a draft document with computed totals", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId,
        issueDate: "2026-08-19",
        lines: [
          { description: "Printing", quantity: 2, unitPrice: 5000, taxRate: 18 },
          { description: "Delivery", quantity: 1, unitPrice: 1000, taxRate: 0 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.document.status).toBe("DRAFT");
    expect(res.body.document.number).toBeNull();
    expect(res.body.document.subtotal).toBe(11000);
    expect(res.body.document.taxTotal).toBe(1800);
    expect(res.body.document.total).toBe(12800);
    expect(res.body.document.lines).toHaveLength(2);
  });

  it("allows creating a draft with zero lines", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "INVOICE", customerId, issueDate: "2026-08-19", lines: [] });

    expect(res.status).toBe(201);
    expect(res.body.document.total).toBe(0);
  });

  it("rejects a missing customerId with 400", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "INVOICE", issueDate: "2026-08-19", lines: [] });
    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp())
      .post("/documents")
      .send({ type: "INVOICE", customerId: "x", issueDate: "2026-08-19", lines: [] });
    expect(res.status).toBe(401);
  });
});
```

`server/src/routes/documents.get.test.ts`:

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

describe("GET /documents/:id", () => {
  it("returns the document with lines and customer name", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId,
        issueDate: "2026-08-19",
        lines: [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }],
      });

    const res = await request(app).get(`/documents/${created.body.document.id}`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.document.customer.name).toBe("Musanze Supplies");
    expect(res.body.document.lines).toHaveLength(1);
  });

  it("returns 404 for a document belonging to a different business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "INVOICE", customerId, issueDate: "2026-08-19", lines: [] });

    const otherRes = await request(app).post("/auth/register").send({
      email: "other@example.com",
      password: "Supersecret1!",
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).get(`/documents/${created.body.document.id}`).set("Cookie", otherCookies);
    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/documents/x");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server -- documents.list documents.create documents.get`
Expected: FAIL, `/documents` route doesn't exist yet.

- [ ] **Step 3: Implement**

`server/src/routes/documents.ts`:

```ts
import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { documentListQuerySchema, documentSchema } from "@billa/shared";
import type { DocumentInput, DocumentListQuery } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate.js";
import { validateQuery } from "../middleware/validate-query.js";
import { calculateDocumentTotals } from "../lib/document-totals.js";

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

const DOCUMENT_INCLUDE = {
  lines: { orderBy: { sortOrder: "asc" as const } },
  customer: { select: { name: true } },
};

documentsRouter.get("/", validateQuery(documentListQuerySchema), async (req, res) => {
  const query = req.listQuery as DocumentListQuery;
  const businessId = req.auth!.businessId;

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

  const [results, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder } as Prisma.DocumentOrderByWithRelationInput,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { customer: { select: { name: true } } },
    }),
    prisma.document.count({ where }),
  ]);

  res.json({ results, total, page: query.page, pageSize: query.pageSize });
});

documentsRouter.post("/", validateBody(documentSchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const body = req.body as DocumentInput;
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  const totals = calculateDocumentTotals(body.lines);

  const document = await prisma.document.create({
    data: {
      businessId,
      type: body.type,
      status: "DRAFT",
      template: business!.defaultTemplate,
      customerId: body.customerId,
      issueDate: new Date(body.issueDate),
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      notes: body.notes,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      lines: {
        create: body.lines.map((line, index) => ({
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

  res.status(201).json({ document });
});

documentsRouter.get("/:id", async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const document = await prisma.document.findFirst({
    where: { id, businessId },
    include: DOCUMENT_INCLUDE,
  });

  if (!document) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  res.json({ document });
});
```

Modify `server/src/app.ts`, add the import and mount alongside the existing routers:

```ts
import { documentsRouter } from "./routes/documents.js";
```

```ts
app.use("/documents", documentsRouter);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=server -- documents.list documents.create documents.get`
Expected: PASS, all tests across the three new files.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/documents.ts server/src/routes/documents.list.test.ts server/src/routes/documents.create.test.ts server/src/routes/documents.get.test.ts server/src/app.ts
git commit -m "add document list, create, and get endpoints"
```

---

### Task 5: Documents route, update (PATCH)

**Files:**
- Modify: `server/src/routes/documents.ts`
- Test: `server/src/routes/documents.patch.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
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

async function createDraft(app: ReturnType<typeof createApp>, cookies: string[], customerId: string) {
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

describe("PATCH /documents/:id", () => {
  it("replaces the header and line items, recomputing totals", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const id = await createDraft(app, cookies, customerId);

    const res = await request(app)
      .patch(`/documents/${id}`)
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId,
        issueDate: "2026-08-20",
        lines: [
          { description: "Printing", quantity: 3, unitPrice: 5000, taxRate: 18 },
          { description: "Delivery", quantity: 1, unitPrice: 2000, taxRate: 0 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.document.lines).toHaveLength(2);
    expect(res.body.document.subtotal).toBe(17000);
    expect(res.body.document.total).toBe(19700);
  });

  it("rejects updates to a finalized document with 409", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const id = await createDraft(app, cookies, customerId);
    await prisma.document.update({ where: { id }, data: { status: "FINALIZED", number: "INV-0001" } });

    const res = await request(app)
      .patch(`/documents/${id}`)
      .set("Cookie", cookies)
      .send({ type: "INVOICE", customerId, issueDate: "2026-08-19", lines: [] });

    expect(res.status).toBe(409);
  });

  it("returns 404 for a document belonging to a different business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const id = await createDraft(app, cookies, customerId);

    const otherRes = await request(app).post("/auth/register").send({
      email: "other@example.com",
      password: "Supersecret1!",
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app)
      .patch(`/documents/${id}`)
      .set("Cookie", otherCookies)
      .send({ type: "INVOICE", customerId, issueDate: "2026-08-19", lines: [] });
    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp())
      .patch("/documents/x")
      .send({ type: "INVOICE", customerId: "x", issueDate: "2026-08-19", lines: [] });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server -- documents.patch.test.ts`
Expected: FAIL, `PATCH /documents/:id` doesn't exist yet (404s where 200/409 expected).

- [ ] **Step 3: Implement**

Add to `server/src/routes/documents.ts`, after the `GET /:id` handler:

```ts
documentsRouter.patch("/:id", validateBody(documentSchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;
  const body = req.body as DocumentInput;

  const existing = await prisma.document.findFirst({ where: { id, businessId } });
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (existing.status === "FINALIZED") {
    res.status(409).json({ error: "already_finalized" });
    return;
  }

  const totals = calculateDocumentTotals(body.lines);

  const document = await prisma.$transaction(async (tx) => {
    await tx.documentLine.deleteMany({ where: { documentId: id } });
    return tx.document.update({
      where: { id },
      data: {
        type: body.type,
        customerId: body.customerId,
        issueDate: new Date(body.issueDate),
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        lines: {
          create: body.lines.map((line, index) => ({
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
  });

  res.json({ document });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=server -- documents.patch.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/documents.ts server/src/routes/documents.patch.test.ts
git commit -m "add document update endpoint"
```

---

### Task 6: Documents route, finalize

**Files:**
- Modify: `server/src/routes/documents.ts`
- Modify: `server/src/lib/document-sequences.ts`
- Test: `server/src/routes/documents.finalize.test.ts`

- [ ] **Step 1: Write the failing tests**

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

async function createDraft(
  app: ReturnType<typeof createApp>,
  cookies: string[],
  customerId: string,
  hasLine = true,
) {
  const res = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-19",
      lines: hasLine ? [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }] : [],
    });
  return res.body.document.id as string;
}

describe("POST /documents/:id/finalize", () => {
  it("assigns INV-0001 to the first finalized invoice for a business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const id = await createDraft(app, cookies, customerId);

    const res = await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.document.number).toBe("INV-0001");
    expect(res.body.document.status).toBe("FINALIZED");
  });

  it("assigns sequential numbers across repeated finalizes", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const firstId = await createDraft(app, cookies, customerId);
    await request(app).post(`/documents/${firstId}/finalize`).set("Cookie", cookies);

    const secondId = await createDraft(app, cookies, customerId);
    const res = await request(app).post(`/documents/${secondId}/finalize`).set("Cookie", cookies);

    expect(res.body.document.number).toBe("INV-0002");
  });

  it("rejects finalizing a document with no lines", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const id = await createDraft(app, cookies, customerId, false);

    const res = await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
    expect(res.status).toBe(400);
  });

  it("rejects finalizing an already-finalized document", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const id = await createDraft(app, cookies, customerId);
    await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);

    const res = await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
    expect(res.status).toBe(409);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/documents/x/finalize");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server -- documents.finalize.test.ts`
Expected: FAIL, `POST /documents/:id/finalize` doesn't exist yet.

- [ ] **Step 3: Implement**

In `server/src/lib/document-sequences.ts`, export the prefix map (change `const DEFAULT_PREFIXES` to `export const DEFAULT_PREFIXES`).

Add to `server/src/routes/documents.ts`. First, add the import at the top:

```ts
import { DEFAULT_PREFIXES } from "../lib/document-sequences.js";
```

Then add the route, after the `PATCH /:id` handler:

```ts
documentsRouter.post("/:id/finalize", async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const document = await prisma.document.findFirst({ where: { id, businessId }, include: { lines: true } });
  if (!document) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (document.status === "FINALIZED") {
    res.status(409).json({ error: "already_finalized" });
    return;
  }
  if (document.lines.length === 0) {
    res.status(400).json({ error: "no_lines" });
    return;
  }

  const finalized = await prisma.$transaction(async (tx) => {
    const existingSequence = await tx.documentSequence.findUnique({
      where: { businessId_type: { businessId, type: document.type } },
    });

    const assignedNumber = existingSequence ? existingSequence.nextNumber : 1;
    const prefix = existingSequence ? existingSequence.prefix : DEFAULT_PREFIXES[document.type];

    await tx.documentSequence.upsert({
      where: { businessId_type: { businessId, type: document.type } },
      create: { businessId, type: document.type, prefix, nextNumber: assignedNumber + 1 },
      update: { nextNumber: assignedNumber + 1 },
    });

    return tx.document.update({
      where: { id },
      data: {
        number: `${prefix}${String(assignedNumber).padStart(4, "0")}`,
        status: "FINALIZED",
      },
      include: DOCUMENT_INCLUDE,
    });
  });

  res.json({ document: finalized });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=server -- documents.finalize.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/documents.ts server/src/lib/document-sequences.ts server/src/routes/documents.finalize.test.ts
git commit -m "add document finalize endpoint with sequential numbering"
```

---

### Task 7: Documents route, delete

**Files:**
- Modify: `server/src/routes/documents.ts`
- Test: `server/src/routes/documents.delete.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
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

async function createDraft(app: ReturnType<typeof createApp>, cookies: string[], customerId: string) {
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

describe("DELETE /documents/:id", () => {
  it("deletes a draft document and its lines", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const id = await createDraft(app, cookies, customerId);

    const res = await request(app).delete(`/documents/${id}`).set("Cookie", cookies);

    expect(res.status).toBe(204);
    const found = await prisma.document.findUnique({ where: { id } });
    expect(found).toBeNull();
  });

  it("rejects deleting a finalized document with 409", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const id = await createDraft(app, cookies, customerId);
    await prisma.document.update({ where: { id }, data: { status: "FINALIZED", number: "INV-0001" } });

    const res = await request(app).delete(`/documents/${id}`).set("Cookie", cookies);
    expect(res.status).toBe(409);
  });

  it("returns 404 for a document belonging to a different business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const id = await createDraft(app, cookies, customerId);

    const otherRes = await request(app).post("/auth/register").send({
      email: "other@example.com",
      password: "Supersecret1!",
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).delete(`/documents/${id}`).set("Cookie", otherCookies);
    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).delete("/documents/x");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server -- documents.delete.test.ts`
Expected: FAIL, `DELETE /documents/:id` doesn't exist yet.

- [ ] **Step 3: Implement**

Add to `server/src/routes/documents.ts`, after the finalize handler:

```ts
documentsRouter.delete("/:id", async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const existing = await prisma.document.findFirst({ where: { id, businessId } });
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (existing.status === "FINALIZED") {
    res.status(409).json({ error: "already_finalized" });
    return;
  }

  await prisma.$transaction([
    prisma.documentLine.deleteMany({ where: { documentId: id } }),
    prisma.document.delete({ where: { id } }),
  ]);

  res.status(204).send();
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=server -- documents.delete.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/documents.ts server/src/routes/documents.delete.test.ts
git commit -m "add document delete endpoint"
```

---

### Task 8: usePaginatedList extraParams support

**Files:**
- Modify: `client/src/lib/usePaginatedList.ts`
- Modify: `client/src/lib/usePaginatedList.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `client/src/lib/usePaginatedList.test.ts`, inside the `describe("usePaginatedList", ...)` block:

```ts
  it("includes extraParams in the request", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ results: [], total: 0, page: 1, pageSize: 20 }));

    renderHook(() =>
      usePaginatedList<Row, "createdAt">({
        resourcePath: "/documents",
        defaultSortBy: "createdAt",
        extraParams: { type: "INVOICE" },
      }),
    );

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("type=INVOICE");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=client -- usePaginatedList.test.ts`
Expected: FAIL, `extraParams` is not a recognized option (TS error) and/or the request doesn't include `type=INVOICE`.

- [ ] **Step 3: Implement**

Modify `client/src/lib/usePaginatedList.ts`:

```ts
interface UsePaginatedListParams<SortByT extends string> {
  resourcePath: string;
  defaultSortBy: SortByT;
  pageSize?: number;
  extraParams?: Record<string, string>;
}

export function usePaginatedList<T, SortByT extends string>({
  resourcePath,
  defaultSortBy,
  pageSize = 20,
  extraParams,
}: UsePaginatedListParams<SortByT>) {
```

And inside the fetch `useEffect`, change the params construction to:

```ts
      const params = new URLSearchParams({
        sortBy,
        sortOrder,
        page: String(page),
        pageSize: String(pageSize),
        includeInactive: String(includeInactive),
        ...extraParams,
      });
      if (search.trim()) params.set("search", search.trim());
```

And update the effect's dependency array to include the stringified `extraParams` (a fresh object literal from the caller shouldn't cause an extra refetch each render):

```ts
  }, [resourcePath, search, sortBy, sortOrder, page, pageSize, includeInactive, reloadToken, JSON.stringify(extraParams)]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=client -- usePaginatedList.test.ts`
Expected: PASS, all 6 tests (5 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/usePaginatedList.ts client/src/lib/usePaginatedList.test.ts
git commit -m "support extra static query params in usePaginatedList"
```

---

### Task 9: SearchDropdown, CustomerPicker, ItemPicker

**Files:**
- Create: `client/src/components/SearchDropdown.tsx`
- Test: `client/src/components/SearchDropdown.test.tsx`
- Create: `client/src/components/customers/CustomerPicker.tsx`
- Test: `client/src/components/customers/CustomerPicker.test.tsx`
- Create: `client/src/components/items/ItemPicker.tsx`
- Test: `client/src/components/items/ItemPicker.test.tsx`

- [ ] **Step 1: Write the failing tests**

`client/src/components/SearchDropdown.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchDropdown } from "./SearchDropdown";

describe("SearchDropdown", () => {
  it("calls onQueryChange as the user types", async () => {
    const onQueryChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchDropdown
        id="test"
        label="Test"
        placeholder="Search"
        query=""
        onQueryChange={onQueryChange}
        options={[]}
        isLoading={false}
        onSelect={() => {}}
      />,
    );
    await user.type(screen.getByLabelText("Test"), "a");
    expect(onQueryChange).toHaveBeenCalledWith("a");
  });

  it("shows options when open and calls onSelect when one is clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchDropdown
        id="test"
        label="Test"
        placeholder="Search"
        query=""
        onQueryChange={() => {}}
        options={[{ id: "1", label: "Kigali Traders" }]}
        isLoading={false}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByLabelText("Test"));
    await user.click(await screen.findByText("Kigali Traders"));
    expect(onSelect).toHaveBeenCalledWith({ id: "1", label: "Kigali Traders" });
  });

  it("shows a loading message while isLoading is true", async () => {
    const user = userEvent.setup();
    render(
      <SearchDropdown
        id="test"
        label="Test"
        placeholder="Search"
        query=""
        onQueryChange={() => {}}
        options={[]}
        isLoading={true}
        onSelect={() => {}}
      />,
    );
    await user.click(screen.getByLabelText("Test"));
    expect(await screen.findByText(/searching/i)).toBeInTheDocument();
  });

  it("shows a no-results message when there are no options and not loading", async () => {
    const user = userEvent.setup();
    render(
      <SearchDropdown
        id="test"
        label="Test"
        placeholder="Search"
        query="xyz"
        onQueryChange={() => {}}
        options={[]}
        isLoading={false}
        onSelect={() => {}}
      />,
    );
    await user.click(screen.getByLabelText("Test"));
    expect(await screen.findByText(/no results/i)).toBeInTheDocument();
  });
});
```

`client/src/components/customers/CustomerPicker.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomerPicker } from "./CustomerPicker";

describe("CustomerPicker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("searches customers as the user types and calls onSelect when one is picked", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ id: "c1", name: "Kigali Traders", phone: "0788000000" }],
          total: 1,
          page: 1,
          pageSize: 10,
        }),
        { status: 200 },
      ),
    );
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<CustomerPicker value="" onSelect={onSelect} />);

    await user.click(screen.getByLabelText("Customer"));
    await user.type(screen.getByLabelText("Customer"), "Kigali");

    const option = await screen.findByText("Kigali Traders");
    await user.click(option);

    expect(onSelect).toHaveBeenCalledWith({ id: "c1", name: "Kigali Traders" });
  });
});
```

`client/src/components/items/ItemPicker.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ItemPicker } from "./ItemPicker";

describe("ItemPicker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("searches items as the user types and calls onSelect with description and price", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ id: "i1", description: "Printing service", unitPrice: 5000, unit: "service" }],
          total: 1,
          page: 1,
          pageSize: 10,
        }),
        { status: 200 },
      ),
    );
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ItemPicker value="" onSelect={onSelect} />);

    await user.click(screen.getByLabelText("Item"));
    await user.type(screen.getByLabelText("Item"), "Printing");

    const option = await screen.findByText("Printing service");
    await user.click(option);

    expect(onSelect).toHaveBeenCalledWith({ id: "i1", description: "Printing service", unitPrice: 5000 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=client -- SearchDropdown.test.tsx CustomerPicker.test.tsx ItemPicker.test.tsx`
Expected: FAIL, none of the three components exist yet.

- [ ] **Step 3: Implement**

`client/src/components/SearchDropdown.tsx`:

```tsx
import { useState } from "react";

export interface SearchDropdownOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface SearchDropdownProps {
  id: string;
  label: string;
  placeholder: string;
  error?: string;
  query: string;
  onQueryChange: (value: string) => void;
  options: SearchDropdownOption[];
  isLoading: boolean;
  onSelect: (option: SearchDropdownOption) => void;
}

export function SearchDropdown({
  id,
  label,
  placeholder,
  error,
  query,
  onQueryChange,
  options,
  isLoading,
  onSelect,
}: SearchDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className="font-sans text-sm font-medium text-neutral-800">
        {label}
      </label>
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        autoComplete="off"
        className={`rounded-lg border px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 ${
          error ? "border-error" : "border-neutral-200"
        }`}
      />
      {isOpen && (
        <div className="absolute top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
          {isLoading ? (
            <p className="px-3.5 py-2.5 font-sans text-sm text-neutral-400">Searching…</p>
          ) : options.length === 0 ? (
            <p className="px-3.5 py-2.5 font-sans text-sm text-neutral-400">No results</p>
          ) : (
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(option);
                  setIsOpen(false);
                }}
                className="flex w-full flex-col px-3.5 py-2.5 text-left font-sans text-sm hover:bg-neutral-50"
              >
                <span className="text-neutral-900">{option.label}</span>
                {option.sublabel && <span className="text-xs text-neutral-400">{option.sublabel}</span>}
              </button>
            ))
          )}
        </div>
      )}
      {error && (
        <p className="font-sans text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
```

`client/src/components/customers/CustomerPicker.tsx`:

```tsx
import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/apiClient";
import { SearchDropdown, type SearchDropdownOption } from "../SearchDropdown";

interface CustomerResult {
  id: string;
  name: string;
  phone: string | null;
}

export interface CustomerSelection {
  id: string;
  name: string;
}

interface CustomerPickerProps {
  value: string;
  error?: string;
  onSelect: (customer: CustomerSelection) => void;
}

export function CustomerPicker({ value, error, onSelect }: CustomerPickerProps) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<SearchDropdownOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsLoading(true);
      const params = new URLSearchParams({ pageSize: "10" });
      if (query.trim()) params.set("search", query.trim());
      apiRequest<{ results: CustomerResult[] }>(`/customers?${params.toString()}`)
        .then((data) => {
          setOptions(data.results.map((c) => ({ id: c.id, label: c.name, sublabel: c.phone ?? undefined })));
        })
        .finally(() => setIsLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <SearchDropdown
      id="customer"
      label="Customer"
      placeholder="Search customers"
      error={error}
      query={query}
      onQueryChange={setQuery}
      options={options}
      isLoading={isLoading}
      onSelect={(option) => {
        setQuery(option.label);
        onSelect({ id: option.id, name: option.label });
      }}
    />
  );
}
```

`client/src/components/items/ItemPicker.tsx`:

```tsx
import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/apiClient";
import { SearchDropdown, type SearchDropdownOption } from "../SearchDropdown";

interface ItemResult {
  id: string;
  description: string;
  unitPrice: number;
  unit: string;
}

export interface ItemSelection {
  id: string;
  description: string;
  unitPrice: number;
}

interface ItemPickerProps {
  value: string;
  error?: string;
  onSelect: (item: ItemSelection) => void;
}

export function ItemPicker({ value, error, onSelect }: ItemPickerProps) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<SearchDropdownOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [resultsById, setResultsById] = useState<Record<string, ItemResult>>({});

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsLoading(true);
      const params = new URLSearchParams({ pageSize: "10" });
      if (query.trim()) params.set("search", query.trim());
      apiRequest<{ results: ItemResult[] }>(`/items?${params.toString()}`)
        .then((data) => {
          setOptions(data.results.map((item) => ({ id: item.id, label: item.description, sublabel: item.unit })));
          setResultsById(Object.fromEntries(data.results.map((item) => [item.id, item])));
        })
        .finally(() => setIsLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <SearchDropdown
      id="item"
      label="Item"
      placeholder="Search items"
      error={error}
      query={query}
      onQueryChange={setQuery}
      options={options}
      isLoading={isLoading}
      onSelect={(option) => {
        setQuery(option.label);
        const item = resultsById[option.id];
        onSelect({ id: option.id, description: option.label, unitPrice: item?.unitPrice ?? 0 });
      }}
    />
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=client -- SearchDropdown.test.tsx CustomerPicker.test.tsx ItemPicker.test.tsx`
Expected: PASS, all 6 tests (4 + 1 + 1).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/SearchDropdown.tsx client/src/components/SearchDropdown.test.tsx client/src/components/customers/CustomerPicker.tsx client/src/components/customers/CustomerPicker.test.tsx client/src/components/items/ItemPicker.tsx client/src/components/items/ItemPicker.test.tsx
git commit -m "add SearchDropdown, CustomerPicker, ItemPicker"
```

---

### Task 10: DocumentForm

**Files:**
- Create: `client/src/lib/documentTypeLabels.ts`
- Create: `client/src/pages/DocumentForm.tsx`
- Test: `client/src/pages/DocumentForm.test.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DocumentForm from "./DocumentForm";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderNew() {
  return render(
    <MemoryRouter initialEntries={["/documents/new?type=INVOICE"]}>
      <Routes>
        <Route path="/documents/new" element={<DocumentForm />} />
        <Route path="/documents/:id/edit" element={<DocumentForm />} />
        <Route path="/documents/:id" element={<div>view document page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderEdit(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/documents/${id}/edit`]}>
      <Routes>
        <Route path="/documents/new" element={<DocumentForm />} />
        <Route path="/documents/:id/edit" element={<DocumentForm />} />
        <Route path="/documents/:id" element={<div>view document page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("DocumentForm", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds and removes line items, updating the live total", async () => {
    const user = userEvent.setup();
    renderNew();

    expect(screen.getByText(/subtotal: 0 rwf/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add line/i }));
    await user.type(screen.getByLabelText("Item"), "Printing");
    const descriptionInputs = screen.getAllByLabelText("Item");
    void descriptionInputs;

    const quantityInput = screen.getByLabelText(/quantity/i);
    await user.clear(quantityInput);
    await user.type(quantityInput, "2");
    const priceInput = screen.getByLabelText(/unit price/i);
    await user.clear(priceInput);
    await user.type(priceInput, "5000");

    await waitFor(() => expect(screen.getByText(/subtotal: 10,000 rwf/i)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /remove line 1/i }));
    expect(screen.getByText(/subtotal: 0 rwf/i)).toBeInTheDocument();
  });

  it("saves a new draft and navigates to its edit URL", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/documents") && init?.method === "POST") {
        return new Response(JSON.stringify({ document: { id: "d1" } }), { status: 201 });
      }
      if (url.endsWith("/documents/d1") && (!init || init.method === undefined)) {
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
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderNew();

    const customerInput = screen.getByLabelText("Customer");
    await user.type(customerInput, "Kigali");

    await user.click(screen.getByRole("button", { name: /save draft/i }));

    // Save navigates to /documents/d1/edit, which remounts DocumentForm with isEditing=true;
    // the Finalize button only renders in edit mode, so its presence confirms the navigation worked.
    await waitFor(() => expect(screen.getByRole("button", { name: /finalize/i })).toBeInTheDocument());
  });

  it("loads an existing draft for editing", async () => {
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

  it("finalizes a document after confirming and navigates to the view page", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/documents/d1") && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify({
            document: {
              id: "d1",
              customerId: "c1",
              customer: { name: "Kigali Traders" },
              issueDate: "2026-08-19T00:00:00.000Z",
              dueDate: null,
              notes: null,
              lines: [{ id: "l1", itemId: null, description: "Printing", quantity: "1.00", unitPrice: 5000, taxRate: "18.00" }],
            },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/documents/d1/finalize") && init?.method === "POST") {
        return new Response(JSON.stringify({ document: { id: "d1", number: "INV-0001" } }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderEdit("d1");

    await screen.findByDisplayValue("Printing");
    await user.click(screen.getByRole("button", { name: /finalize/i }));

    await waitFor(() => expect(screen.getByText("view document page")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=client -- DocumentForm.test.tsx`
Expected: FAIL, `./DocumentForm` does not exist.

- [ ] **Step 3: Implement**

`client/src/lib/documentTypeLabels.ts`:

```ts
import type { DocumentType } from "@billa/shared";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, { singular: string; plural: string }> = {
  INVOICE: { singular: "invoice", plural: "Invoices" },
  PROFORMA: { singular: "proforma invoice", plural: "Proforma invoices" },
  DELIVERY_NOTE: { singular: "delivery note", plural: "Delivery notes" },
  QUOTE: { singular: "quote", plural: "Quotes" },
  RECEIPT: { singular: "receipt", plural: "Receipts" },
};
```

`client/src/pages/DocumentForm.tsx`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import type { DocumentType } from "@billa/shared";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { AppLayout } from "../components/AppLayout";
import { CustomerPicker } from "../components/customers/CustomerPicker";
import { ItemPicker } from "../components/items/ItemPicker";
import { FormField } from "../components/FormField";
import { apiRequest, ApiError } from "../lib/apiClient";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";
import { formatRwf } from "../lib/money";

const lineFormSchema = z.object({
  itemId: z.string().optional(),
  description: z.string().trim().min(1, "Enter a description"),
  quantity: z.number({ invalid_type_error: "Enter a quantity" }).positive("Enter a quantity greater than zero"),
  unitPrice: z
    .number({ invalid_type_error: "Enter a price" })
    .int("Enter a whole number of RWF")
    .nonnegative("Price can't be negative"),
  taxRate: z
    .number({ invalid_type_error: "Enter a tax rate" })
    .min(0, "Tax rate can't be negative")
    .max(100, "Tax rate can't exceed 100%"),
});

const documentFormSchema = z.object({
  customerId: z.string().trim().min(1, "Choose a customer"),
  customerName: z.string().trim(),
  issueDate: z.string().trim().min(1, "Choose an issue date"),
  dueDate: z.string().trim(),
  notes: z.string().trim(),
  lines: z.array(lineFormSchema),
});
type DocumentFormInput = z.infer<typeof documentFormSchema>;

interface DocumentLineResponse {
  itemId: string | null;
  description: string;
  quantity: string | number;
  unitPrice: number;
  taxRate: string | number;
}

interface DocumentResponse {
  id: string;
  customerId: string;
  customer: { name: string };
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  lines: DocumentLineResponse[];
}

function calculateLiveTotals(lines: { quantity?: number; unitPrice?: number; taxRate?: number }[]) {
  let subtotal = 0;
  let taxTotal = 0;
  for (const line of lines) {
    const lineTotal = Math.round((line.quantity || 0) * (line.unitPrice || 0));
    const taxAmount = Math.round(lineTotal * ((line.taxRate || 0) / 100));
    subtotal += lineTotal;
    taxTotal += taxAmount;
  }
  return { subtotal, taxTotal, total: subtotal + taxTotal };
}

export default function DocumentForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const type = (searchParams.get("type") as DocumentType) ?? "INVOICE";
  const isEditing = Boolean(id);
  const labels = DOCUMENT_TYPE_LABELS[type];

  const [apiError, setApiError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(!isEditing);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<DocumentFormInput>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: {
      customerId: "",
      customerName: "",
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      notes: "",
      lines: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const watchedLines = watch("lines");

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
      setIsLoaded(true);
    });
  }, [id, isEditing, reset]);

  const totals = calculateLiveTotals(watchedLines ?? []);

  function addLine() {
    append({ description: "", quantity: 1, unitPrice: 0, taxRate: 18 });
  }

  async function saveDraft(data: DocumentFormInput) {
    setApiError(null);
    setIsSaving(true);
    try {
      const payload = {
        type,
        customerId: data.customerId,
        issueDate: data.issueDate,
        dueDate: data.dueDate.trim() || undefined,
        notes: data.notes.trim() || undefined,
        lines: data.lines,
      };
      const response = isEditing
        ? await apiRequest<{ document: DocumentResponse }>(`/documents/${id}`, { method: "PATCH", body: payload })
        : await apiRequest<{ document: DocumentResponse }>("/documents", { method: "POST", body: payload });
      navigate(`/documents/${response.document.id}/edit`, { replace: true });
    } catch (err) {
      setApiError(
        err instanceof ApiError ? "Couldn't save this document. Try again." : "Something went wrong. Try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleFinalize() {
    if (!id) return;
    if ((watchedLines ?? []).length === 0) {
      setApiError("Add at least one line before finalizing.");
      return;
    }
    if (
      !window.confirm(
        `Finalize this ${labels.singular}? It will get a permanent number and can no longer be edited.`,
      )
    ) {
      return;
    }
    setApiError(null);
    setIsFinalizing(true);
    try {
      await apiRequest(`/documents/${id}/finalize`, { method: "POST" });
      navigate(`/documents/${id}`);
    } catch {
      setApiError("Couldn't finalize this document. Try again.");
    } finally {
      setIsFinalizing(false);
    }
  }

  if (!isLoaded) {
    return (
      <AppLayout>
        <p className="font-sans text-sm text-neutral-600">Loading…</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold text-neutral-900">
          {isEditing ? `Edit ${labels.singular}` : `New ${labels.singular}`}
        </h1>

        {apiError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit(saveDraft)} className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4">
            <CustomerPicker
              value={watch("customerName")}
              error={errors.customerId?.message}
              onSelect={(customer) => {
                setValue("customerId", customer.id);
                setValue("customerName", customer.name);
              }}
            />
            <FormField
              id="issueDate"
              label="Issue date"
              type="date"
              error={errors.issueDate?.message}
              {...register("issueDate")}
            />
            <FormField id="dueDate" label="Due date" type="date" error={errors.dueDate?.message} {...register("dueDate")} />
            <FormField id="notes" label="Notes" type="text" error={errors.notes?.message} {...register("notes")} />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-sans text-sm font-semibold text-neutral-800">Line items</h2>
              <button
                type="button"
                onClick={addLine}
                className="font-sans text-sm text-primary-500 hover:text-primary-700"
              >
                Add line
              </button>
            </div>

            {fields.length === 0 ? (
              <p className="font-sans text-sm text-neutral-400">No lines yet.</p>
            ) : (
              <table className="w-full border-collapse font-sans text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500">
                    <th className="py-2">Item</th>
                    <th className="py-2">Quantity</th>
                    <th className="py-2">Unit price</th>
                    <th className="py-2">Tax %</th>
                    <th className="py-2">Line total</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field, index) => {
                    const line = watchedLines?.[index];
                    const lineTotal = line ? Math.round((line.quantity || 0) * (line.unitPrice || 0)) : 0;
                    return (
                      <tr key={field.id} className="border-b border-neutral-100">
                        <td className="py-2">
                          <ItemPicker
                            value={watch(`lines.${index}.description`) ?? ""}
                            error={errors.lines?.[index]?.description?.message}
                            onSelect={(item) => {
                              setValue(`lines.${index}.itemId`, item.id);
                              setValue(`lines.${index}.description`, item.description);
                              setValue(`lines.${index}.unitPrice`, item.unitPrice);
                            }}
                          />
                        </td>
                        <td className="py-2">
                          <input
                            type="number"
                            step="0.01"
                            aria-label="Quantity"
                            className="w-20 rounded-lg border border-neutral-200 px-2 py-1.5"
                            {...register(`lines.${index}.quantity`, { valueAsNumber: true })}
                          />
                        </td>
                        <td className="py-2">
                          <input
                            type="number"
                            aria-label="Unit price"
                            className="w-24 rounded-lg border border-neutral-200 px-2 py-1.5"
                            {...register(`lines.${index}.unitPrice`, { valueAsNumber: true })}
                          />
                        </td>
                        <td className="py-2">
                          <input
                            type="number"
                            aria-label="Tax rate"
                            className="w-16 rounded-lg border border-neutral-200 px-2 py-1.5"
                            {...register(`lines.${index}.taxRate`, { valueAsNumber: true })}
                          />
                        </td>
                        <td className="py-2 text-neutral-600">{formatRwf(lineTotal)}</td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            aria-label={`Remove line ${index + 1}`}
                            className="text-neutral-400 hover:text-neutral-600"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex flex-col items-end gap-1 font-sans text-sm text-neutral-600">
            <span>Subtotal: {formatRwf(totals.subtotal)}</span>
            <span>Tax: {formatRwf(totals.taxTotal)}</span>
            <span className="font-semibold text-neutral-900">Total: {formatRwf(totals.total)}</span>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center justify-center rounded-lg bg-primary-500 px-6 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSaving ? "Saving…" : "Save draft"}
            </button>
            {isEditing && (
              <button
                type="button"
                disabled={isFinalizing}
                onClick={handleFinalize}
                className="flex items-center justify-center rounded-lg bg-neutral-900 px-6 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isFinalizing ? "Finalizing…" : "Finalize"}
              </button>
            )}
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
```

Modify `client/src/App.tsx`, add the import and both routes inside the `ProtectedRoute` block:

```tsx
import DocumentForm from "./pages/DocumentForm";
```

```tsx
<Route path="/documents/new" element={<DocumentForm />} />
<Route path="/documents/:id/edit" element={<DocumentForm />} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=client -- DocumentForm.test.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/documentTypeLabels.ts client/src/pages/DocumentForm.tsx client/src/pages/DocumentForm.test.tsx client/src/App.tsx
git commit -m "add document create/edit form with line items"
```

---

### Task 11: Documents list page

**Files:**
- Create: `client/src/pages/Documents.tsx`
- Test: `client/src/pages/Documents.test.tsx`
- Modify: `client/src/components/AppLayout.tsx`
- Modify: `client/src/components/AppLayout.test.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Write the failing tests**

`client/src/pages/Documents.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Documents from "./Documents";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderDocuments() {
  return render(
    <MemoryRouter initialEntries={["/documents?type=INVOICE"]}>
      <Routes>
        <Route path="/documents" element={<Documents />} />
        <Route path="/documents/new" element={<div>new document page</div>} />
        <Route path="/documents/:id/edit" element={<div>edit document page</div>} />
        <Route path="/documents/:id" element={<div>view document page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Documents", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the empty state when there are no invoices", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/documents")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    renderDocuments();

    expect(await screen.findByText(/no invoices yet/i)).toBeInTheDocument();
  });

  it("renders a list of invoices with formatted totals", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/documents")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "d1",
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
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderDocuments();

    expect(await screen.findByText("INV-0001")).toBeInTheDocument();
    expect(screen.getByText("5,900 RWF")).toBeInTheDocument();
  });

  it("navigates to the edit form when a draft row is clicked", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/documents")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "d1",
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
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderDocuments();
    await user.click(await screen.findByText("Draft"));

    await waitFor(() => expect(screen.getByText("edit document page")).toBeInTheDocument());
  });

  it("navigates to the new invoice form when 'New invoice' is clicked", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 }),
    );

    const user = userEvent.setup();
    renderDocuments();
    await screen.findByText(/no invoices yet/i);

    await user.click(screen.getAllByRole("button", { name: /new invoice/i })[0]);

    await waitFor(() => expect(screen.getByText("new document page")).toBeInTheDocument());
  });
});
```

Add to `client/src/components/AppLayout.test.tsx`'s "renders nav links and children" test:

```tsx
    expect(screen.getByRole("link", { name: /invoices/i })).toBeInTheDocument();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=client -- Documents.test.tsx AppLayout.test.tsx`
Expected: FAIL, `./Documents` does not exist, and the "Invoices" link assertion fails.

- [ ] **Step 3: Implement**

`client/src/pages/Documents.tsx`:

```tsx
import type { DocumentType } from "@billa/shared";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "../components/AppLayout";
import { usePaginatedList } from "../lib/usePaginatedList";
import { formatRwf } from "../lib/money";
import { DOCUMENT_TYPE_LABELS } from "../lib/documentTypeLabels";

interface DocumentRow {
  id: string;
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
  const type = (searchParams.get("type") as DocumentType) ?? "INVOICE";
  const labels = DOCUMENT_TYPE_LABELS[type];

  const list = usePaginatedList<DocumentRow, SortBy>({
    resourcePath: "/documents",
    defaultSortBy: "createdAt",
    extraParams: { type },
  });

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

  function openDocument(document: DocumentRow) {
    if (document.status === "DRAFT") {
      navigate(`/documents/${document.id}/edit`);
    } else {
      navigate(`/documents/${document.id}`);
    }
  }

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-neutral-900">{labels.plural}</h1>
          <button
            type="button"
            onClick={() => navigate(`/documents/new?type=${type}`)}
            className="flex w-auto items-center justify-center rounded-lg bg-primary-500 px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
          >
            New {labels.singular}
          </button>
        </div>

        <input
          type="text"
          placeholder={`Search ${labels.plural.toLowerCase()}`}
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
          <div className="flex flex-col gap-2" aria-label={`Loading ${labels.plural.toLowerCase()}`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-100" />
            ))}
          </div>
        ) : list.results.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
            <p className="font-sans text-sm text-neutral-600">No {labels.plural.toLowerCase()} yet.</p>
            <button
              type="button"
              onClick={() => navigate(`/documents/new?type=${type}`)}
              className="flex w-auto items-center justify-center rounded-lg bg-primary-500 px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary-700"
            >
              New {labels.singular}
            </button>
          </div>
        ) : (
          <table className="w-full border-collapse font-sans text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="cursor-pointer py-2" onClick={() => list.toggleSort("issueDate")}>
                  Date {list.sortBy === "issueDate" && (list.sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th className="py-2">Number</th>
                <th className="py-2">Customer</th>
                <th className="cursor-pointer py-2" onClick={() => list.toggleSort("total")}>
                  Total {list.sortBy === "total" && (list.sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th className="py-2">Status</th>
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
                  <td className="py-3">{document.number ?? "Draft"}</td>
                  <td className="py-3 text-neutral-600">{document.customer.name}</td>
                  <td className="py-3 text-neutral-600">{formatRwf(document.total)}</td>
                  <td className="py-3 text-neutral-600">{document.status}</td>
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

Modify `client/src/components/AppLayout.tsx`, add the "Invoices" link before "Customers" in the `<nav>`:

```tsx
          <Link to="/documents?type=INVOICE" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Invoices
          </Link>
```

Modify `client/src/App.tsx`, add the import and route inside the `ProtectedRoute` block:

```tsx
import Documents from "./pages/Documents";
```

```tsx
<Route path="/documents" element={<Documents />} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=client -- Documents.test.tsx AppLayout.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Documents.tsx client/src/pages/Documents.test.tsx client/src/components/AppLayout.tsx client/src/components/AppLayout.test.tsx client/src/App.tsx
git commit -m "add invoices list page and nav link"
```

---

### Task 12: DocumentView (read-only)

**Files:**
- Create: `client/src/pages/DocumentView.tsx`
- Test: `client/src/pages/DocumentView.test.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import DocumentView from "./DocumentView";

describe("DocumentView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the document number, customer, lines, and totals", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          document: {
            id: "d1",
            number: "INV-0001",
            status: "FINALIZED",
            customer: { name: "Kigali Traders" },
            lines: [{ id: "l1", description: "Printing", quantity: "2.00", unitPrice: 5000, lineTotal: 10000 }],
            subtotal: 10000,
            taxTotal: 1800,
            total: 11800,
          },
        }),
        { status: 200 },
      ),
    );

    render(
      <MemoryRouter initialEntries={["/documents/d1"]}>
        <Routes>
          <Route path="/documents/:id" element={<DocumentView />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("INV-0001")).toBeInTheDocument();
    expect(screen.getByText("Kigali Traders")).toBeInTheDocument();
    expect(screen.getByText("Printing")).toBeInTheDocument();
    expect(screen.getByText(/total: 11,800 rwf/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=client -- DocumentView.test.tsx`
Expected: FAIL, `./DocumentView` does not exist.

- [ ] **Step 3: Implement**

`client/src/pages/DocumentView.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/apiClient";
import { formatRwf } from "../lib/money";

interface DocumentLine {
  id: string;
  description: string;
  quantity: string | number;
  unitPrice: number;
  lineTotal: number;
}

interface DocumentDetail {
  id: string;
  number: string | null;
  status: "DRAFT" | "FINALIZED";
  customer: { name: string };
  lines: DocumentLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
}

export default function DocumentView() {
  const { id } = useParams();
  const [document, setDocument] = useState<DocumentDetail | null>(null);

  useEffect(() => {
    apiRequest<{ document: DocumentDetail }>(`/documents/${id}`).then((data) => setDocument(data.document));
  }, [id]);

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
          <span className="font-sans text-sm text-neutral-500">{document.status}</span>
        </div>
        <p className="font-sans text-sm text-neutral-600">{document.customer.name}</p>
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

Modify `client/src/App.tsx`, add the import and route inside the `ProtectedRoute` block:

```tsx
import DocumentView from "./pages/DocumentView";
```

```tsx
<Route path="/documents/:id" element={<DocumentView />} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=client -- DocumentView.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/DocumentView.tsx client/src/pages/DocumentView.test.tsx client/src/App.tsx
git commit -m "add read-only document view page"
```

---

### Task 13: Full suite, typecheck, and real-browser verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite in all three workspaces**

Run:
```bash
npm run test --workspace=shared
npm run test --workspace=server
npm run test --workspace=client
```
Expected: all pass, including every existing test from prior stages plus everything added in this plan.

- [ ] **Step 2: Typecheck all three workspaces**

Run:
```bash
npm run typecheck --workspace=shared
npm run typecheck --workspace=server
npm run typecheck --workspace=client
```
Expected: no errors.

- [ ] **Step 3: Real-browser smoke test**

With the API server, client dev server, and Postgres running:

1. Log in, go to Customers and Items and confirm at least one of each exists (create if needed).
2. Click "Invoices" in the nav. Confirm the empty state and "New invoice" button render.
3. Start a new invoice: pick a customer via the picker, set an issue date, add a line via the item picker (confirm description/price autofill), add a second line manually, remove one line, confirm the live subtotal/tax/total update as you type.
4. Save as draft. Confirm it navigates to the edit URL and the invoice now appears in the Invoices list with "Draft" status.
5. Re-open the draft, change a line's quantity, save again, confirm the total updates.
6. Finalize the invoice. Confirm the browser's confirm dialog appears, accept it, and confirm it now shows a real number (`INV-0001`) and `FINALIZED` status, and that the page is read-only afterward.
7. Create and finalize a second invoice, confirm it gets `INV-0002`.
8. Attempt to edit a finalized invoice by navigating directly to its edit URL if reachable, or confirm the list routes finalized rows to the view page instead of the edit form.
9. Check the Browser pane's console and network tab for unexpected errors.

- [ ] **Step 4: Commit any fixes found during manual verification**

If verification surfaces a bug, fix it, re-run the relevant test file, then:
```bash
git add <fixed files>
git commit -m "fix <what was wrong>"
```

If no bugs are found, nothing to commit for this task.

---

## Self-Review Notes

- **Spec coverage:** schema change (Task 1), shared validation (Task 2), server-computed totals (Task 3), full CRUD + finalize + delete (Tasks 4-7), generic list hook reuse (Task 8), catalog pickers (Task 9), the form itself including live totals and the save/finalize split (Task 10), the type-scoped list page and nav entry (Task 11), the read-only finalized view (Task 12). All spec sections have a corresponding task.
- **Forward-dependency fix caught during planning:** Task 5's and Task 7's "rejects action on a finalized document" tests set `status: FINALIZED` directly via `prisma.document.update(...)` in the test setup, rather than calling the `/finalize` endpoint built in Task 6. This keeps each task's tests self-contained and executable in task order without a forward dependency on a later task's endpoint.
- **Type consistency checked:** `DocumentInput`/`DocumentListQuery` from `@billa/shared` are used identically across `documents.ts`'s five handlers (Tasks 4-7). `DOCUMENT_INCLUDE` (defined once in Task 4) is reused unchanged by every handler that returns a full document, so the response shape never drifts. `CustomerSelection`/`ItemSelection` (Task 9) match exactly what `DocumentForm.tsx` (Task 10) expects in its `onSelect` callbacks. `usePaginatedList`'s `extraParams` (Task 8) is consumed the same way by `Documents.tsx` (Task 11) as it's tested.
- **Known accepted limitation:** the finalize transaction (Task 6) reads then writes `DocumentSequence.nextNumber` without row-level locking. Under genuine concurrent finalize calls for the same business and document type, the second request could fail with a database error (unique constraint violation) rather than silently succeeding with a duplicate number, since Postgres's unique index on `(businessId, type, number)` catches the collision. This fails safely rather than corrupting data, and matches the level of concurrency protection already accepted elsewhere in this codebase (e.g. `PUT /business/sequences`). Not worth solving here for a single-business, low-concurrency SME tool.
