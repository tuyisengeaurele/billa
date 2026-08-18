# Business Profile & Numbering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend endpoints to read/update the business profile and per-type document numbering config.

**Architecture:** A `businessRouter` (`server/src/routes/business.ts`) mounted at `/business`, entirely behind `requireAuth`, always scoped to `req.auth.businessId`. A small pure helper (`mergeSequences`) merges saved `DocumentSequence` rows with computed defaults so the API always returns exactly 5 entries. Zod schemas live in `@billa/shared`. Integration tests hit the real `billa_test` Postgres database, same pattern as the auth stage.

**Tech Stack:** Express, Prisma, zod, vitest, supertest (all already in place from the auth stage — no new dependencies).

---

### Task 1: Sequence-merging helper

**Files:**
- Create: `server/src/lib/document-sequences.ts`
- Test: `server/src/lib/document-sequences.test.ts`

- [ ] **Step 1: Write the failing test**

`server/src/lib/document-sequences.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mergeSequences } from "./document-sequences.js";

describe("mergeSequences", () => {
  it("returns computed defaults for all 5 types when nothing is saved", () => {
    const result = mergeSequences([]);
    expect(result).toEqual([
      { type: "INVOICE", prefix: "INV-", nextNumber: 1 },
      { type: "PROFORMA", prefix: "PRO-", nextNumber: 1 },
      { type: "DELIVERY_NOTE", prefix: "DN-", nextNumber: 1 },
      { type: "QUOTE", prefix: "QTE-", nextNumber: 1 },
      { type: "RECEIPT", prefix: "RCT-", nextNumber: 1 },
    ]);
  });

  it("uses the saved row for a type that has one, defaults for the rest", () => {
    const result = mergeSequences([{ type: "INVOICE", prefix: "CUSTOM-", nextNumber: 42 }]);
    const invoice = result.find((r) => r.type === "INVOICE");
    const quote = result.find((r) => r.type === "QUOTE");
    expect(invoice).toEqual({ type: "INVOICE", prefix: "CUSTOM-", nextNumber: 42 });
    expect(quote).toEqual({ type: "QUOTE", prefix: "QTE-", nextNumber: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server -- document-sequences.test.ts`
Expected: FAIL — `./document-sequences.js` doesn't exist

- [ ] **Step 3: Implement**

`server/src/lib/document-sequences.ts`:

```ts
import { DOCUMENT_TYPES, type DocumentType } from "@billa/shared";

const DEFAULT_PREFIXES: Record<DocumentType, string> = {
  INVOICE: "INV-",
  PROFORMA: "PRO-",
  DELIVERY_NOTE: "DN-",
  QUOTE: "QTE-",
  RECEIPT: "RCT-",
};

export interface SequenceView {
  type: DocumentType;
  prefix: string;
  nextNumber: number;
}

export function mergeSequences(
  saved: { type: string; prefix: string; nextNumber: number }[],
): SequenceView[] {
  const savedByType = new Map(saved.map((s) => [s.type, s]));
  return DOCUMENT_TYPES.map((type) => {
    const existing = savedByType.get(type);
    return existing
      ? { type, prefix: existing.prefix, nextNumber: existing.nextNumber }
      : { type, prefix: DEFAULT_PREFIXES[type], nextNumber: 1 };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=server -- document-sequences.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/document-sequences.ts server/src/lib/document-sequences.test.ts
git commit -m "add document sequence defaults/merge helper"
```

---

### Task 2: Shared Zod schemas for business profile and sequences

**Files:**
- Create: `shared/src/business-schemas.ts`
- Test: `shared/src/business-schemas.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

`shared/src/business-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { businessProfileSchema, documentSequenceSchema, updateSequencesSchema } from "./business-schemas.js";

describe("businessProfileSchema", () => {
  it("accepts a partial update", () => {
    const result = businessProfileSchema.safeParse({ tin: "123456789", phone: "+250788000000" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = businessProfileSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty body", () => {
    const result = businessProfileSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("documentSequenceSchema", () => {
  it("accepts a valid entry", () => {
    const result = documentSequenceSchema.safeParse({ type: "INVOICE", prefix: "INV-", nextNumber: 1 });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown type", () => {
    const result = documentSequenceSchema.safeParse({ type: "BANANA", prefix: "INV-", nextNumber: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects a prefix longer than 10 characters", () => {
    const result = documentSequenceSchema.safeParse({
      type: "INVOICE",
      prefix: "WAY-TOO-LONG-",
      nextNumber: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive nextNumber", () => {
    const result = documentSequenceSchema.safeParse({ type: "INVOICE", prefix: "INV-", nextNumber: 0 });
    expect(result.success).toBe(false);
  });
});

describe("updateSequencesSchema", () => {
  it("accepts 1-5 valid entries", () => {
    const result = updateSequencesSchema.safeParse([
      { type: "INVOICE", prefix: "INV-", nextNumber: 1 },
      { type: "QUOTE", prefix: "QTE-", nextNumber: 1 },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects an empty array", () => {
    const result = updateSequencesSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it("rejects duplicate types in the same array", () => {
    const result = updateSequencesSchema.safeParse([
      { type: "INVOICE", prefix: "A-", nextNumber: 1 },
      { type: "INVOICE", prefix: "B-", nextNumber: 1 },
    ]);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=shared`
Expected: FAIL — `./business-schemas.js` doesn't exist

- [ ] **Step 3: Implement**

`shared/src/business-schemas.ts`:

```ts
import { z } from "zod";
import { DOCUMENT_TYPES } from "./document-types.js";

export const businessProfileSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    tin: z.string().trim().min(1).optional(),
    industry: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    email: z.string().email().optional(),
    address: z.string().trim().min(1).optional(),
    rraEbmNumber: z.string().trim().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "at least one field is required",
  });
export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;

export const documentSequenceSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  prefix: z.string().min(1).max(10),
  nextNumber: z.number().int().positive(),
});
export type DocumentSequenceInput = z.infer<typeof documentSequenceSchema>;

export const updateSequencesSchema = z
  .array(documentSequenceSchema)
  .min(1)
  .max(5)
  .refine((items) => new Set(items.map((i) => i.type)).size === items.length, {
    message: "duplicate type in sequence update",
  });
```

Edit `shared/src/index.ts`, add:

```ts
export * from "./business-schemas.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=shared`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add shared/src/business-schemas.ts shared/src/business-schemas.test.ts shared/src/index.ts
git commit -m "add shared zod schemas for business profile and sequences"
```

---

### Task 3: GET /business

**Files:**
- Create: `server/src/routes/business.ts`
- Modify: `server/src/app.ts`
- Test: `server/src/routes/business.get.test.ts`

- [ ] **Step 1: Write the failing test**

`server/src/routes/business.get.test.ts`:

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
    password: "supersecret1",
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

describe("GET /business", () => {
  it("returns the business profile for the authenticated user", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).get("/business").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.business.name).toBe("Kigali Traders");
    expect(res.body.business.tin).toBeNull();
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/business");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server -- business.get.test.ts`
Expected: FAIL — route doesn't exist (404)

- [ ] **Step 3: Implement the route and wire it in**

`server/src/routes/business.ts`:

```ts
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";

export const businessRouter = Router();

businessRouter.use(requireAuth);

businessRouter.get("/", async (req, res) => {
  const business = await prisma.business.findUnique({ where: { id: req.auth!.businessId } });
  if (!business) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ business });
});
```

Edit `server/src/app.ts` — add the import:

```ts
import { businessRouter } from "./routes/business.js";
```

and mount it after the auth router:

```ts
app.use("/business", businessRouter);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=server -- business.get.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/business.ts server/src/app.ts server/src/routes/business.get.test.ts
git commit -m "add GET /business"
```

---

### Task 4: PATCH /business

**Files:**
- Modify: `server/src/routes/business.ts`
- Test: `server/src/routes/business.patch.test.ts`

- [ ] **Step 1: Write the failing test**

`server/src/routes/business.patch.test.ts`:

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
    password: "supersecret1",
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

describe("PATCH /business", () => {
  it("updates the provided fields and leaves others untouched", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .patch("/business")
      .set("Cookie", cookies)
      .send({ tin: "123456789", phone: "+250788000000" });

    expect(res.status).toBe(200);
    expect(res.body.business.tin).toBe("123456789");
    expect(res.body.business.phone).toBe("+250788000000");
    expect(res.body.business.name).toBe("Kigali Traders");
  });

  it("rejects an invalid email with 400", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).patch("/business").set("Cookie", cookies).send({ email: "not-an-email" });

    expect(res.status).toBe(400);
  });

  it("rejects an empty body with 400", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).patch("/business").set("Cookie", cookies).send({});

    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).patch("/business").send({ tin: "123456789" });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server -- business.patch.test.ts`
Expected: FAIL — no PATCH handler (404)

- [ ] **Step 3: Implement**

Edit `server/src/routes/business.ts` — add the import:

```ts
import { businessProfileSchema } from "@billa/shared";
import { validateBody } from "../middleware/validate.js";
```

Then add the route:

```ts
businessRouter.patch("/", validateBody(businessProfileSchema), async (req, res) => {
  const business = await prisma.business.update({
    where: { id: req.auth!.businessId },
    data: req.body,
  });
  res.json({ business });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=server -- business.patch.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/business.ts server/src/routes/business.patch.test.ts
git commit -m "add PATCH /business"
```

---

### Task 5: GET /business/sequences

**Files:**
- Modify: `server/src/routes/business.ts`
- Test: `server/src/routes/business.sequences.get.test.ts`

- [ ] **Step 1: Write the failing test**

`server/src/routes/business.sequences.get.test.ts`:

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
    password: "supersecret1",
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

describe("GET /business/sequences", () => {
  it("returns computed defaults for all 5 types when none are saved", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).get("/business/sequences").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.sequences).toHaveLength(5);
    expect(res.body.sequences).toContainEqual({ type: "INVOICE", prefix: "INV-", nextNumber: 1 });
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/business/sequences");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server -- business.sequences.get.test.ts`
Expected: FAIL — route doesn't exist (404)

- [ ] **Step 3: Implement**

Edit `server/src/routes/business.ts` — add the import:

```ts
import { mergeSequences } from "../lib/document-sequences.js";
```

Then add the route:

```ts
businessRouter.get("/sequences", async (req, res) => {
  const saved = await prisma.documentSequence.findMany({ where: { businessId: req.auth!.businessId } });
  res.json({ sequences: mergeSequences(saved) });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=server -- business.sequences.get.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/business.ts server/src/routes/business.sequences.get.test.ts
git commit -m "add GET /business/sequences"
```

---

### Task 6: PUT /business/sequences

**Files:**
- Modify: `server/src/routes/business.ts`
- Test: `server/src/routes/business.sequences.put.test.ts`

- [ ] **Step 1: Write the failing test**

`server/src/routes/business.sequences.put.test.ts`:

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
    password: "supersecret1",
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

describe("PUT /business/sequences", () => {
  it("saves a custom prefix and starting number for one type", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .put("/business/sequences")
      .set("Cookie", cookies)
      .send([{ type: "INVOICE", prefix: "KGL-", nextNumber: 100 }]);

    expect(res.status).toBe(200);
    expect(res.body.sequences).toContainEqual({ type: "INVOICE", prefix: "KGL-", nextNumber: 100 });
    expect(res.body.sequences).toContainEqual({ type: "QUOTE", prefix: "QTE-", nextNumber: 1 });

    const rows = await prisma.documentSequence.findMany();
    expect(rows).toHaveLength(1);
  });

  it("upserts on a second call rather than duplicating", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    await request(app)
      .put("/business/sequences")
      .set("Cookie", cookies)
      .send([{ type: "INVOICE", prefix: "KGL-", nextNumber: 100 }]);

    await request(app)
      .put("/business/sequences")
      .set("Cookie", cookies)
      .send([{ type: "INVOICE", prefix: "KGL-", nextNumber: 150 }]);

    const rows = await prisma.documentSequence.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].nextNumber).toBe(150);
  });

  it("rejects duplicate types in the same request with 400", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .put("/business/sequences")
      .set("Cookie", cookies)
      .send([
        { type: "INVOICE", prefix: "A-", nextNumber: 1 },
        { type: "INVOICE", prefix: "B-", nextNumber: 1 },
      ]);

    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp())
      .put("/business/sequences")
      .send([{ type: "INVOICE", prefix: "KGL-", nextNumber: 100 }]);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server -- business.sequences.put.test.ts`
Expected: FAIL — no PUT handler (404)

- [ ] **Step 3: Implement**

Edit `server/src/routes/business.ts` — add the imports:

```ts
import type { DocumentType as PrismaDocumentType } from "@prisma/client";
import { businessProfileSchema, updateSequencesSchema } from "@billa/shared";
```

(replace the existing `businessProfileSchema`-only import from `@billa/shared` with this combined version)

Then add the route:

```ts
businessRouter.put("/sequences", validateBody(updateSequencesSchema), async (req, res) => {
  const updates = req.body as { type: string; prefix: string; nextNumber: number }[];

  await prisma.$transaction(
    updates.map((update) =>
      prisma.documentSequence.upsert({
        where: {
          businessId_type: {
            businessId: req.auth!.businessId,
            type: update.type as PrismaDocumentType,
          },
        },
        create: {
          businessId: req.auth!.businessId,
          type: update.type as PrismaDocumentType,
          prefix: update.prefix,
          nextNumber: update.nextNumber,
        },
        update: {
          prefix: update.prefix,
          nextNumber: update.nextNumber,
        },
      }),
    ),
  );

  const saved = await prisma.documentSequence.findMany({ where: { businessId: req.auth!.businessId } });
  res.json({ sequences: mergeSequences(saved) });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=server -- business.sequences.put.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/business.ts server/src/routes/business.sequences.put.test.ts
git commit -m "add PUT /business/sequences"
```

---

### Task 7: Full suite check, typecheck, and manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Run the full server and shared test suites**

Run:
```bash
npm run test --workspace=shared
npm run test --workspace=server
```
Expected: all tests PASS, including every file from the auth stage plus this stage's new files

- [ ] **Step 2: Typecheck all workspaces**

Run:
```bash
npm run typecheck --workspace=shared
npm run typecheck --workspace=server
npm run typecheck --workspace=client
```
Expected: no errors

- [ ] **Step 3: Manual smoke test against the real dev server**

Run: `npm run dev:server`

In another terminal:

```bash
curl -i -c cookies.txt -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"biz-smoke@example.com","password":"supersecret1","businessName":"Kigali Traders"}'

curl -i -b cookies.txt http://localhost:4000/business

curl -i -b cookies.txt -X PATCH http://localhost:4000/business \
  -H "Content-Type: application/json" \
  -d '{"tin":"123456789","address":"KG 7 Ave, Kigali"}'

curl -i -b cookies.txt http://localhost:4000/business/sequences

curl -i -b cookies.txt -X PUT http://localhost:4000/business/sequences \
  -H "Content-Type: application/json" \
  -d '[{"type":"INVOICE","prefix":"KGL-","nextNumber":100}]'

curl -i -b cookies.txt http://localhost:4000/business/sequences
```

Expected: register returns 201, first `/business` shows the bare profile, PATCH
returns the updated profile with `tin`/`address` set, first `/business/sequences`
shows all 5 defaults, PUT returns `INVOICE` overridden to `KGL-`/100 with the
rest still default, and the final GET confirms the override persisted.

Delete `cookies.txt` afterward and stop the dev server.

- [ ] **Step 4: Final commit if any cleanup was needed**

If steps 1–3 required fixes, commit them:

```bash
git add -A
git commit -m "fix issues found in business profile smoke test"
```

If nothing needed fixing, skip this step.
