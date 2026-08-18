# Customer & Item CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend CRUD for Customer and Item, a minimal authenticated app shell, and list/create/edit UI for both, so the document engine stage has real catalog data to pull from.

**Architecture:** Two new Express route files mirror `business.ts`'s tenant-isolation pattern. List endpoints share a `validateQuery` middleware and return a generic `{ results, total, page, pageSize }` envelope so the client can share one `usePaginatedList` hook between Customers and Items. A shared `Modal` component (slide-over, blurred backdrop) hosts `CustomerForm`/`ItemForm` for both create and edit.

**Tech Stack:** Express, Prisma, Zod (shared schemas), React, react-hook-form, framer-motion. All already in place, no new dependencies.

**Reference:** `docs/superpowers/specs/2026-08-19-customer-item-crud-design.md`

---

## File Structure

- Create: `shared/src/customer-schemas.ts`, `shared/src/item-schemas.ts`: create/update/list-query Zod schemas for each resource.
- Create: `server/src/middleware/validate-query.ts`: query-string validation middleware, mirrors `validate.ts`'s `validateBody`.
- Create: `server/src/routes/customers.ts`, `server/src/routes/items.ts`: CRUD routes.
- Modify: `server/src/app.ts`: mount the two new routers.
- Create: `client/src/lib/money.ts`: `formatRwf()` helper.
- Create: `client/src/lib/usePaginatedList.ts`: shared search/sort/pagination data hook.
- Create: `client/src/components/Modal.tsx`: slide-over panel primitive.
- Create: `client/src/components/AppLayout.tsx`: top bar + nav for authenticated pages.
- Modify: `client/src/pages/Dashboard.tsx`: wrap content in `AppLayout`.
- Create: `client/src/components/customers/CustomerForm.tsx`.
- Create: `client/src/pages/Customers.tsx`.
- Create: `client/src/components/items/ItemForm.tsx`.
- Create: `client/src/pages/Items.tsx`.
- Modify: `client/src/App.tsx`: add `/customers` and `/items` routes.

Each new file gets its own colocated `.test.tsx`/`.test.ts` file, matching the existing pattern.

---

### Task 1: Shared customer and item schemas

**Files:**
- Create: `shared/src/customer-schemas.ts`
- Test: `shared/src/customer-schemas.test.ts`
- Create: `shared/src/item-schemas.ts`
- Test: `shared/src/item-schemas.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Write the failing tests**

`shared/src/customer-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { customerListQuerySchema, customerSchema, customerUpdateSchema } from "./customer-schemas.js";

describe("customerSchema", () => {
  it("accepts a name-only customer", () => {
    expect(customerSchema.safeParse({ name: "Kigali Traders" }).success).toBe(true);
  });

  it("rejects a missing name", () => {
    expect(customerSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(customerSchema.safeParse({ name: "Kigali Traders", email: "not-an-email" }).success).toBe(false);
  });
});

describe("customerUpdateSchema", () => {
  it("accepts isActive alone", () => {
    expect(customerUpdateSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(customerUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a partial update without a name", () => {
    expect(customerUpdateSchema.safeParse({ phone: "+250788000000" }).success).toBe(true);
  });
});

describe("customerListQuerySchema", () => {
  it("applies defaults when nothing is provided", () => {
    expect(customerListQuerySchema.parse({})).toEqual({
      sortBy: "createdAt",
      sortOrder: "desc",
      page: 1,
      pageSize: 20,
      includeInactive: false,
    });
  });

  it("coerces page and pageSize from strings", () => {
    const result = customerListQuerySchema.parse({ page: "2", pageSize: "10" });
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
  });

  it("parses includeInactive=false as false, not true", () => {
    expect(customerListQuerySchema.parse({ includeInactive: "false" }).includeInactive).toBe(false);
  });

  it("rejects an unknown sortBy value", () => {
    expect(customerListQuerySchema.safeParse({ sortBy: "banana" }).success).toBe(false);
  });
});
```

`shared/src/item-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { itemListQuerySchema, itemSchema, itemUpdateSchema } from "./item-schemas.js";

describe("itemSchema", () => {
  it("accepts a valid item", () => {
    expect(itemSchema.safeParse({ description: "Printing", unitPrice: 5000, unit: "service" }).success).toBe(true);
  });

  it("rejects a missing description", () => {
    expect(itemSchema.safeParse({ unitPrice: 5000, unit: "service" }).success).toBe(false);
  });

  it("rejects a zero or negative price", () => {
    expect(itemSchema.safeParse({ description: "Printing", unitPrice: 0, unit: "service" }).success).toBe(false);
  });

  it("rejects a non-integer price", () => {
    expect(itemSchema.safeParse({ description: "Printing", unitPrice: 5000.5, unit: "service" }).success).toBe(
      false,
    );
  });

  it("rejects a missing unit", () => {
    expect(itemSchema.safeParse({ description: "Printing", unitPrice: 5000 }).success).toBe(false);
  });
});

describe("itemUpdateSchema", () => {
  it("accepts isActive alone", () => {
    expect(itemUpdateSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(itemUpdateSchema.safeParse({}).success).toBe(false);
  });
});

describe("itemListQuerySchema", () => {
  it("applies defaults when nothing is provided", () => {
    expect(itemListQuerySchema.parse({})).toEqual({
      sortBy: "createdAt",
      sortOrder: "desc",
      page: 1,
      pageSize: 20,
      includeInactive: false,
    });
  });

  it("rejects an unknown sortBy value", () => {
    expect(itemListQuerySchema.safeParse({ sortBy: "banana" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=shared`
Expected: FAIL, `./customer-schemas.js` and `./item-schemas.js` don't exist.

- [ ] **Step 3: Implement**

`shared/src/customer-schemas.ts`:

```ts
import { z } from "zod";

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Enter a customer name"),
  tin: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  email: z.string().trim().email("Enter a valid email address").optional(),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const customerUpdateSchema = customerSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((data) => Object.keys(data).length > 0, { message: "at least one field is required" });
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

export const customerListQuerySchema = z.object({
  search: z.string().trim().optional(),
  sortBy: z.enum(["name", "createdAt"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((value) => value === "true"),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
```

`shared/src/item-schemas.ts`:

```ts
import { z } from "zod";

export const itemSchema = z.object({
  description: z.string().trim().min(1, "Enter a description"),
  unitPrice: z
    .number({ invalid_type_error: "Enter a price" })
    .int("Enter a whole number of RWF")
    .positive("Enter a price greater than zero"),
  unit: z.string().trim().min(1, "Enter a unit"),
});
export type ItemInput = z.infer<typeof itemSchema>;

export const itemUpdateSchema = itemSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((data) => Object.keys(data).length > 0, { message: "at least one field is required" });
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;

export const itemListQuerySchema = z.object({
  search: z.string().trim().optional(),
  sortBy: z.enum(["description", "unitPrice", "createdAt"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((value) => value === "true"),
});
export type ItemListQuery = z.infer<typeof itemListQuerySchema>;
```

Add both to `shared/src/index.ts` alongside the existing exports (`export * from "./customer-schemas.js";` and `export * from "./item-schemas.js";`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=shared`
Expected: PASS, all tests including the new ones.

- [ ] **Step 5: Commit**

```bash
git add shared/src/customer-schemas.ts shared/src/customer-schemas.test.ts shared/src/item-schemas.ts shared/src/item-schemas.test.ts shared/src/index.ts
git commit -m "add customer and item shared schemas"
```

---

### Task 2: Server validateQuery middleware

**Files:**
- Create: `server/src/middleware/validate-query.ts`
- Test: `server/src/middleware/validate-query.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import { validateQuery } from "./validate-query.js";

describe("validateQuery", () => {
  it("attaches the parsed, defaulted query to req.listQuery", async () => {
    const schema = z.object({ page: z.coerce.number().optional().default(1) });
    const app = express();
    app.get("/probe", validateQuery(schema), (req, res) => res.json({ listQuery: req.listQuery }));

    const res = await request(app).get("/probe");
    expect(res.body.listQuery).toEqual({ page: 1 });
  });

  it("rejects an invalid query with 400", async () => {
    const schema = z.object({ sortBy: z.enum(["name"]) });
    const app = express();
    app.get("/probe", validateQuery(schema), (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/probe?sortBy=banana");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_query");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server -- validate-query.test.ts`
Expected: FAIL, `./validate-query.js` does not exist.

- [ ] **Step 3: Implement**

```ts
import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

declare global {
  namespace Express {
    interface Request {
      listQuery?: unknown;
    }
  }
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({ error: "invalid_query", details: result.error.flatten() });
      return;
    }
    req.listQuery = result.data;
    next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=server -- validate-query.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/middleware/validate-query.ts server/src/middleware/validate-query.test.ts
git commit -m "add validateQuery middleware for list endpoints"
```

---

### Task 3: Server customers routes

**Files:**
- Create: `server/src/routes/customers.ts`
- Test: `server/src/routes/customers.list.test.ts`
- Test: `server/src/routes/customers.create.test.ts`
- Test: `server/src/routes/customers.patch.test.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Write the failing tests**

`server/src/routes/customers.list.test.ts`:

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

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[], name: string) {
  await request(app).post("/customers").set("Cookie", cookies).send({ name });
}

describe("GET /customers", () => {
  it("returns customers scoped to the authenticated business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await createCustomer(app, cookies, "Kigali Traders Ltd");
    await createCustomer(app, cookies, "Musanze Supplies");

    const res = await request(app).get("/customers").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(20);
  });

  it("filters by search", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await createCustomer(app, cookies, "Kigali Traders Ltd");
    await createCustomer(app, cookies, "Musanze Supplies");

    const res = await request(app).get("/customers?search=musanze").set("Cookie", cookies);

    expect(res.body.total).toBe(1);
    expect(res.body.results[0].name).toBe("Musanze Supplies");
  });

  it("hides inactive customers by default and shows them with includeInactive=true", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await createCustomer(app, cookies, "Kigali Traders Ltd");
    const list = await request(app).get("/customers").set("Cookie", cookies);
    const customerId = list.body.results[0].id;
    await request(app).patch(`/customers/${customerId}`).set("Cookie", cookies).send({ isActive: false });

    const hidden = await request(app).get("/customers").set("Cookie", cookies);
    expect(hidden.body.total).toBe(0);

    const shown = await request(app).get("/customers?includeInactive=true").set("Cookie", cookies);
    expect(shown.body.total).toBe(1);
  });

  it("paginates results", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    for (let i = 0; i < 3; i += 1) {
      await createCustomer(app, cookies, `Customer ${i}`);
    }

    const res = await request(app).get("/customers?page=1&pageSize=2").set("Cookie", cookies);

    expect(res.body.results).toHaveLength(2);
    expect(res.body.total).toBe(3);
  });

  it("does not return another business's customers", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await createCustomer(app, cookies, "Kigali Traders Ltd");

    const otherRes = await request(app).post("/auth/register").send({
      email: "other@example.com",
      password: "Supersecret1!",
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).get("/customers").set("Cookie", otherCookies);
    expect(res.body.total).toBe(0);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/customers");
    expect(res.status).toBe(401);
  });
});
```

`server/src/routes/customers.create.test.ts`:

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

describe("POST /customers", () => {
  it("creates a customer scoped to the authenticated business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/customers")
      .set("Cookie", cookies)
      .send({ name: "Kigali Traders Ltd", phone: "+250788000000" });

    expect(res.status).toBe(201);
    expect(res.body.customer.name).toBe("Kigali Traders Ltd");
    expect(res.body.customer.isActive).toBe(true);
  });

  it("rejects a missing name with 400", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).post("/customers").set("Cookie", cookies).send({});
    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/customers").send({ name: "Kigali Traders Ltd" });
    expect(res.status).toBe(401);
  });
});
```

`server/src/routes/customers.patch.test.ts`:

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
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Kigali Traders Ltd" });
  return res.body.customer.id as string;
}

describe("PATCH /customers/:id", () => {
  it("updates the provided fields", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createCustomer(app, cookies);

    const res = await request(app).patch(`/customers/${id}`).set("Cookie", cookies).send({ phone: "+250788000000" });

    expect(res.status).toBe(200);
    expect(res.body.customer.phone).toBe("+250788000000");
  });

  it("deactivates and reactivates via isActive", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createCustomer(app, cookies);

    const deactivated = await request(app)
      .patch(`/customers/${id}`)
      .set("Cookie", cookies)
      .send({ isActive: false });
    expect(deactivated.body.customer.isActive).toBe(false);

    const reactivated = await request(app).patch(`/customers/${id}`).set("Cookie", cookies).send({ isActive: true });
    expect(reactivated.body.customer.isActive).toBe(true);
  });

  it("rejects an empty body with 400", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createCustomer(app, cookies);

    const res = await request(app).patch(`/customers/${id}`).set("Cookie", cookies).send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 for a customer belonging to a different business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createCustomer(app, cookies);

    const otherRes = await request(app).post("/auth/register").send({
      email: "other@example.com",
      password: "Supersecret1!",
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).patch(`/customers/${id}`).set("Cookie", otherCookies).send({ phone: "123" });
    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).patch("/customers/x").send({ phone: "123" });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server -- customers`
Expected: FAIL, `/customers` route doesn't exist yet (404s where 200/201/400 expected).

- [ ] **Step 3: Implement**

`server/src/routes/customers.ts`:

```ts
import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { customerListQuerySchema, customerSchema, customerUpdateSchema } from "@billa/shared";
import type { CustomerListQuery } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate.js";
import { validateQuery } from "../middleware/validate-query.js";

export const customersRouter = Router();

customersRouter.use(requireAuth);

customersRouter.get("/", validateQuery(customerListQuerySchema), async (req, res) => {
  const query = req.listQuery as CustomerListQuery;
  const businessId = req.auth!.businessId;

  const where: Prisma.CustomerWhereInput = {
    businessId,
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
  };

  const [results, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder } as Prisma.CustomerOrderByWithRelationInput,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  res.json({ results, total, page: query.page, pageSize: query.pageSize });
});

customersRouter.post("/", validateBody(customerSchema), async (req, res) => {
  const customer = await prisma.customer.create({
    data: { ...req.body, businessId: req.auth!.businessId },
  });
  res.status(201).json({ customer });
});

customersRouter.patch("/:id", validateBody(customerUpdateSchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const result = await prisma.customer.updateMany({
    where: { id, businessId },
    data: req.body,
  });

  if (result.count === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const customer = await prisma.customer.findUnique({ where: { id } });
  res.json({ customer });
});
```

Modify `server/src/app.ts`, add the import and mount:

```ts
import { customersRouter } from "./routes/customers.js";
```

```ts
app.use("/customers", customersRouter);
```

(Add both alongside the existing `businessRouter` import/mount.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=server -- customers`
Expected: PASS, all tests across the three new files.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/customers.ts server/src/routes/customers.list.test.ts server/src/routes/customers.create.test.ts server/src/routes/customers.patch.test.ts server/src/app.ts
git commit -m "add customer CRUD endpoints"
```

---

### Task 4: Server items routes

**Files:**
- Create: `server/src/routes/items.ts`
- Test: `server/src/routes/items.list.test.ts`
- Test: `server/src/routes/items.create.test.ts`
- Test: `server/src/routes/items.patch.test.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Write the failing tests**

`server/src/routes/items.list.test.ts`:

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

async function createItem(app: ReturnType<typeof createApp>, cookies: string[], description: string) {
  await request(app).post("/items").set("Cookie", cookies).send({ description, unitPrice: 1000, unit: "piece" });
}

describe("GET /items", () => {
  it("returns items scoped to the authenticated business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await createItem(app, cookies, "Printing service");
    await createItem(app, cookies, "Delivery box");

    const res = await request(app).get("/items").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.results).toHaveLength(2);
  });

  it("filters by search", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await createItem(app, cookies, "Printing service");
    await createItem(app, cookies, "Delivery box");

    const res = await request(app).get("/items?search=box").set("Cookie", cookies);

    expect(res.body.total).toBe(1);
    expect(res.body.results[0].description).toBe("Delivery box");
  });

  it("hides inactive items by default and shows them with includeInactive=true", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await createItem(app, cookies, "Printing service");
    const list = await request(app).get("/items").set("Cookie", cookies);
    const itemId = list.body.results[0].id;
    await request(app).patch(`/items/${itemId}`).set("Cookie", cookies).send({ isActive: false });

    const hidden = await request(app).get("/items").set("Cookie", cookies);
    expect(hidden.body.total).toBe(0);

    const shown = await request(app).get("/items?includeInactive=true").set("Cookie", cookies);
    expect(shown.body.total).toBe(1);
  });

  it("does not return another business's items", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await createItem(app, cookies, "Printing service");

    const otherRes = await request(app).post("/auth/register").send({
      email: "other@example.com",
      password: "Supersecret1!",
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).get("/items").set("Cookie", otherCookies);
    expect(res.body.total).toBe(0);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/items");
    expect(res.status).toBe(401);
  });
});
```

`server/src/routes/items.create.test.ts`:

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

describe("POST /items", () => {
  it("creates an item scoped to the authenticated business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/items")
      .set("Cookie", cookies)
      .send({ description: "Printing service", unitPrice: 5000, unit: "service" });

    expect(res.status).toBe(201);
    expect(res.body.item.description).toBe("Printing service");
    expect(res.body.item.isActive).toBe(true);
  });

  it("rejects a zero price with 400", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/items")
      .set("Cookie", cookies)
      .send({ description: "Printing service", unitPrice: 0, unit: "service" });
    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp())
      .post("/items")
      .send({ description: "Printing service", unitPrice: 5000, unit: "service" });
    expect(res.status).toBe(401);
  });
});
```

`server/src/routes/items.patch.test.ts`:

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

async function createItem(app: ReturnType<typeof createApp>, cookies: string[]) {
  const res = await request(app)
    .post("/items")
    .set("Cookie", cookies)
    .send({ description: "Printing service", unitPrice: 5000, unit: "service" });
  return res.body.item.id as string;
}

describe("PATCH /items/:id", () => {
  it("updates the provided fields", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createItem(app, cookies);

    const res = await request(app).patch(`/items/${id}`).set("Cookie", cookies).send({ unitPrice: 6000 });

    expect(res.status).toBe(200);
    expect(res.body.item.unitPrice).toBe(6000);
  });

  it("deactivates and reactivates via isActive", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createItem(app, cookies);

    const deactivated = await request(app).patch(`/items/${id}`).set("Cookie", cookies).send({ isActive: false });
    expect(deactivated.body.item.isActive).toBe(false);
  });

  it("rejects an empty body with 400", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createItem(app, cookies);

    const res = await request(app).patch(`/items/${id}`).set("Cookie", cookies).send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 for an item belonging to a different business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const id = await createItem(app, cookies);

    const otherRes = await request(app).post("/auth/register").send({
      email: "other@example.com",
      password: "Supersecret1!",
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).patch(`/items/${id}`).set("Cookie", otherCookies).send({ unitPrice: 1 });
    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).patch("/items/x").send({ unitPrice: 1 });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=server -- items`
Expected: FAIL, `/items` route doesn't exist yet.

- [ ] **Step 3: Implement**

`server/src/routes/items.ts`:

```ts
import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { itemListQuerySchema, itemSchema, itemUpdateSchema } from "@billa/shared";
import type { ItemListQuery } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate.js";
import { validateQuery } from "../middleware/validate-query.js";

export const itemsRouter = Router();

itemsRouter.use(requireAuth);

itemsRouter.get("/", validateQuery(itemListQuerySchema), async (req, res) => {
  const query = req.listQuery as ItemListQuery;
  const businessId = req.auth!.businessId;

  const where: Prisma.ItemWhereInput = {
    businessId,
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.search ? { description: { contains: query.search, mode: "insensitive" } } : {}),
  };

  const [results, total] = await Promise.all([
    prisma.item.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder } as Prisma.ItemOrderByWithRelationInput,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.item.count({ where }),
  ]);

  res.json({ results, total, page: query.page, pageSize: query.pageSize });
});

itemsRouter.post("/", validateBody(itemSchema), async (req, res) => {
  const item = await prisma.item.create({
    data: { ...req.body, businessId: req.auth!.businessId },
  });
  res.status(201).json({ item });
});

itemsRouter.patch("/:id", validateBody(itemUpdateSchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const result = await prisma.item.updateMany({
    where: { id, businessId },
    data: req.body,
  });

  if (result.count === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const item = await prisma.item.findUnique({ where: { id } });
  res.json({ item });
});
```

Modify `server/src/app.ts`, add the import and mount:

```ts
import { itemsRouter } from "./routes/items.js";
```

```ts
app.use("/items", itemsRouter);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=server -- items`
Expected: PASS, all tests across the three new files.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/items.ts server/src/routes/items.list.test.ts server/src/routes/items.create.test.ts server/src/routes/items.patch.test.ts server/src/app.ts
git commit -m "add item CRUD endpoints"
```

---

### Task 5: Client money formatter

**Files:**
- Create: `client/src/lib/money.ts`
- Test: `client/src/lib/money.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { formatRwf } from "./money";

describe("formatRwf", () => {
  it("formats with thousands separators and an RWF suffix", () => {
    expect(formatRwf(12500)).toBe("12,500 RWF");
  });

  it("formats zero", () => {
    expect(formatRwf(0)).toBe("0 RWF");
  });

  it("formats large numbers", () => {
    expect(formatRwf(1234567)).toBe("1,234,567 RWF");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=client -- money.test.ts`
Expected: FAIL, `./money` does not exist.

- [ ] **Step 3: Implement**

```ts
export function formatRwf(amountInRwf: number): string {
  return `${amountInRwf.toLocaleString("en-US")} RWF`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=client -- money.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/money.ts client/src/lib/money.test.ts
git commit -m "add RWF money formatter"
```

---

### Task 6: Modal component

**Files:**
- Create: `client/src/components/Modal.tsx`
- Test: `client/src/components/Modal.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(
      <Modal isOpen={false} onClose={() => {}} title="Test">
        <p>content</p>
      </Modal>,
    );
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("renders the title and children when open", () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Add customer">
        <p>content</p>
      </Modal>,
    );
    expect(screen.getByText("Add customer")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal isOpen={true} onClose={onClose} title="Add customer">
        <p>content</p>
      </Modal>,
    );
    await user.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the panel content is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal isOpen={true} onClose={onClose} title="Add customer">
        <p>content</p>
      </Modal>,
    );
    await user.click(screen.getByText("content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal isOpen={true} onClose={onClose} title="Add customer">
        <p>content</p>
      </Modal>,
    );
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal isOpen={true} onClose={onClose} title="Add customer">
        <p>content</p>
      </Modal>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=client -- Modal.test.tsx`
Expected: FAIL, `./Modal` does not exist.

- [ ] **Step 3: Implement**

```tsx
import { motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex justify-end bg-neutral-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-neutral-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-xl leading-none text-neutral-400 hover:text-neutral-600"
          >
            ×
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=client -- Modal.test.tsx`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Modal.tsx client/src/components/Modal.test.tsx
git commit -m "add Modal slide-over panel primitive"
```

---

### Task 7: AppLayout and Dashboard update

**Files:**
- Create: `client/src/components/AppLayout.tsx`
- Test: `client/src/components/AppLayout.test.tsx`
- Modify: `client/src/pages/Dashboard.tsx`
- Modify: `client/src/pages/Dashboard.test.tsx`

- [ ] **Step 1: Write the failing tests**

`client/src/components/AppLayout.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { AppLayout } from "./AppLayout";

function renderAppLayout() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <AppLayout>
          <p>page content</p>
        </AppLayout>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("AppLayout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nav links and children", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    renderAppLayout();

    expect(await screen.findByRole("link", { name: /customers/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /items/i })).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("calls the logout endpoint when 'Log out' is clicked", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderAppLayout();
    await screen.findByRole("link", { name: /customers/i });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await user.click(screen.getByRole("button", { name: /log out/i }));

    expect(fetchSpy).toHaveBeenCalled();
  });
});
```

`client/src/pages/Dashboard.test.tsx` (replace entirely, needs a router now that `AppLayout` uses `<Link>`):

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Dashboard from "./Dashboard";

describe("Dashboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a welcome message with the business name", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ user: { id: "u1", email: "owner@example.com" }, business: { id: "b1", name: "Kigali Traders" } }),
        { status: 200 },
      ),
    );

    render(
      <MemoryRouter>
        <AuthProvider>
          <Dashboard />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/welcome, kigali traders/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=client -- AppLayout.test.tsx Dashboard.test.tsx`
Expected: FAIL, `./AppLayout` does not exist; `Dashboard.test.tsx` fails too since `<Link>` requires a router `Dashboard.tsx` doesn't provide yet.

- [ ] **Step 3: Implement**

`client/src/components/AppLayout.tsx`:

```tsx
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500">
            <img src="/logo.png" alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
          </span>
          <span className="font-display text-lg font-semibold text-neutral-900">Billa</span>
        </div>
        <nav className="flex items-center gap-6">
          <Link to="/customers" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Customers
          </Link>
          <Link to="/items" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Items
          </Link>
        </nav>
        <button
          type="button"
          onClick={() => logout()}
          className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          Log out
        </button>
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
```

`client/src/pages/Dashboard.tsx` (replace entirely):

```tsx
import { AppLayout } from "../components/AppLayout";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { business } = useAuth();

  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <h1 className="font-display text-3xl font-semibold text-neutral-900">
          Welcome, {business?.name ?? "there"}.
        </h1>
        <p className="font-sans text-sm text-neutral-600">Your account is set up. Invoicing tools are next.</p>
      </div>
    </AppLayout>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=client -- AppLayout.test.tsx Dashboard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/AppLayout.tsx client/src/components/AppLayout.test.tsx client/src/pages/Dashboard.tsx client/src/pages/Dashboard.test.tsx
git commit -m "add AppLayout nav shell, wrap Dashboard in it"
```

---

### Task 8: usePaginatedList hook

**Files:**
- Create: `client/src/lib/usePaginatedList.ts`
- Test: `client/src/lib/usePaginatedList.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePaginatedList } from "./usePaginatedList";

interface Row {
  id: string;
  name: string;
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("usePaginatedList", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the first page on mount", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ results: [{ id: "1", name: "A" }], total: 1, page: 1, pageSize: 20 }));

    const { result } = renderHook(() =>
      usePaginatedList<Row, "name" | "createdAt">({ resourcePath: "/customers", defaultSortBy: "createdAt" }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.results).toEqual([{ id: "1", name: "A" }]);
    expect(result.current.total).toBe(1);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("debounces rapid search updates into a single request", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse({ results: [], total: 0, page: 1, pageSize: 20 }));

    const { result } = renderHook(() =>
      usePaginatedList<Row, "name" | "createdAt">({ resourcePath: "/customers", defaultSortBy: "createdAt" }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    fetchSpy.mockClear();

    act(() => result.current.updateSearch("a"));
    act(() => result.current.updateSearch("ab"));
    act(() => result.current.updateSearch("abc"));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("search=abc");
  });

  it("resets to page 1 when search changes", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse({ results: [], total: 0, page: 1, pageSize: 20 }));

    const { result } = renderHook(() =>
      usePaginatedList<Row, "name" | "createdAt">({ resourcePath: "/customers", defaultSortBy: "createdAt" }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.page).toBe(2));

    act(() => result.current.updateSearch("x"));
    await waitFor(() => expect(result.current.page).toBe(1));
  });

  it("toggleSort flips order on the same column and resets to ascending on a new one", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse({ results: [], total: 0, page: 1, pageSize: 20 }));

    const { result } = renderHook(() =>
      usePaginatedList<Row, "name" | "createdAt">({ resourcePath: "/customers", defaultSortBy: "createdAt" }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleSort("name"));
    await waitFor(() => expect(result.current.sortBy).toBe("name"));
    expect(result.current.sortOrder).toBe("asc");

    act(() => result.current.toggleSort("name"));
    await waitFor(() => expect(result.current.sortOrder).toBe("desc"));
  });

  it("sets an error message when the request fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));

    const { result } = renderHook(() =>
      usePaginatedList<Row, "name" | "createdAt">({ resourcePath: "/customers", defaultSortBy: "createdAt" }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toMatch(/couldn't load/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=client -- usePaginatedList.test.ts`
Expected: FAIL, `./usePaginatedList` does not exist.

- [ ] **Step 3: Implement**

```ts
import { useEffect, useState } from "react";
import { apiRequest } from "./apiClient";

interface PaginatedResponse<T> {
  results: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface UsePaginatedListParams<SortByT extends string> {
  resourcePath: string;
  defaultSortBy: SortByT;
  pageSize?: number;
}

export function usePaginatedList<T, SortByT extends string>({
  resourcePath,
  defaultSortBy,
  pageSize = 20,
}: UsePaginatedListParams<SortByT>) {
  const [results, setResults] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortByT>(defaultSortBy);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        sortBy,
        sortOrder,
        page: String(page),
        pageSize: String(pageSize),
        includeInactive: String(includeInactive),
      });
      if (search.trim()) params.set("search", search.trim());

      apiRequest<PaginatedResponse<T>>(`${resourcePath}?${params.toString()}`)
        .then((data) => {
          if (cancelled) return;
          setResults(data.results);
          setTotal(data.total);
        })
        .catch(() => {
          if (!cancelled) setError("Couldn't load the list. Try again.");
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [resourcePath, search, sortBy, sortOrder, page, pageSize, includeInactive, reloadToken]);

  function toggleSort(column: SortByT) {
    setSortBy((current) => {
      if (current === column) {
        setSortOrder((order) => (order === "asc" ? "desc" : "asc"));
      } else {
        setSortOrder("asc");
      }
      return column;
    });
    setPage(1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateIncludeInactive(value: boolean) {
    setIncludeInactive(value);
    setPage(1);
  }

  function reload() {
    setReloadToken((token) => token + 1);
  }

  return {
    results,
    total,
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
    includeInactive,
    isLoading,
    error,
    setPage,
    toggleSort,
    updateSearch,
    updateIncludeInactive,
    reload,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=client -- usePaginatedList.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/usePaginatedList.ts client/src/lib/usePaginatedList.test.ts
git commit -m "add shared paginated-list data hook"
```

---

### Task 9: CustomerForm

**Files:**
- Create: `client/src/components/customers/CustomerForm.tsx`
- Test: `client/src/components/customers/CustomerForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomerForm } from "./CustomerForm";

describe("CustomerForm", () => {
  it("renders all fields empty when there are no initial values", () => {
    render(<CustomerForm isSubmitting={false} apiError={null} onSubmit={() => {}} />);
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("TIN")).toHaveValue("");
  });

  it("pre-fills fields from initialValues", () => {
    render(
      <CustomerForm
        initialValues={{ name: "Kigali Traders", tin: "123456789" }}
        isSubmitting={false}
        apiError={null}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Kigali Traders");
    expect(screen.getByLabelText("TIN")).toHaveValue("123456789");
  });

  it("requires a name", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CustomerForm isSubmitting={false} apiError={null} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /save customer/i }));

    expect(await screen.findByText(/enter a customer name/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits only the filled-in optional fields", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CustomerForm isSubmitting={false} apiError={null} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "Kigali Traders");
    await user.type(screen.getByLabelText("TIN"), "123456789");
    await user.click(screen.getByRole("button", { name: /save customer/i }));

    expect(onSubmit).toHaveBeenCalledWith({ name: "Kigali Traders", tin: "123456789" });
  });

  it("shows the api error banner when provided", () => {
    render(<CustomerForm isSubmitting={false} apiError="Something went wrong." onSubmit={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong.");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=client -- CustomerForm.test.tsx`
Expected: FAIL, `./CustomerForm` does not exist.

- [ ] **Step 3: Implement**

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../Button";
import { FormField } from "../FormField";

const customerFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a customer name"),
  tin: z.string().trim(),
  address: z.string().trim(),
  phone: z.string().trim(),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email address")]),
});
type CustomerFormInput = z.infer<typeof customerFormSchema>;

export interface CustomerFormValues {
  name: string;
  tin?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface CustomerSubmitValues {
  name: string;
  tin?: string;
  address?: string;
  phone?: string;
  email?: string;
}

interface CustomerFormProps {
  initialValues?: CustomerFormValues;
  isSubmitting: boolean;
  apiError: string | null;
  onSubmit: (values: CustomerSubmitValues) => void;
}

export function CustomerForm({ initialValues, isSubmitting, apiError, onSubmit }: CustomerFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerFormInput>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: initialValues?.name ?? "",
      tin: initialValues?.tin ?? "",
      address: initialValues?.address ?? "",
      phone: initialValues?.phone ?? "",
      email: initialValues?.email ?? "",
    },
  });

  function submit(data: CustomerFormInput) {
    const payload: CustomerSubmitValues = { name: data.name.trim() };
    if (data.tin.trim()) payload.tin = data.tin.trim();
    if (data.address.trim()) payload.address = data.address.trim();
    if (data.phone.trim()) payload.phone = data.phone.trim();
    if (data.email.trim()) payload.email = data.email.trim();
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-1 flex-col gap-5" noValidate>
      {apiError && (
        <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          {apiError}
        </div>
      )}
      <FormField id="name" label="Name" type="text" error={errors.name?.message} {...register("name")} />
      <FormField id="tin" label="TIN" type="text" error={errors.tin?.message} {...register("tin")} />
      <FormField id="address" label="Address" type="text" error={errors.address?.message} {...register("address")} />
      <FormField id="phone" label="Phone" type="tel" error={errors.phone?.message} {...register("phone")} />
      <FormField id="email" label="Email" type="email" error={errors.email?.message} {...register("email")} />
      <Button type="submit" isLoading={isSubmitting}>
        Save customer
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=client -- CustomerForm.test.tsx`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/customers/CustomerForm.tsx client/src/components/customers/CustomerForm.test.tsx
git commit -m "add CustomerForm"
```

---

### Task 10: Customers page

**Files:**
- Create: `client/src/pages/Customers.tsx`
- Test: `client/src/pages/Customers.test.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Customers from "./Customers";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderCustomers() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Customers />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Customers", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the empty state when there are no customers", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/customers")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    renderCustomers();

    expect(await screen.findByText(/no customers yet/i)).toBeInTheDocument();
  });

  it("renders a list of customers", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({
            results: [{ id: "c1", name: "Kigali Traders", tin: null, address: null, phone: "0788000000", email: null, isActive: true }],
            total: 1,
            page: 1,
            pageSize: 20,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderCustomers();

    expect(await screen.findByText("Kigali Traders")).toBeInTheDocument();
  });

  it("creates a customer through the modal and refreshes the list", async () => {
    let created = false;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/customers") && init?.method === "POST") {
        created = true;
        return new Response(JSON.stringify({ customer: { id: "c1", name: "New Co" } }), { status: 201 });
      }
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({
            results: created ? [{ id: "c1", name: "New Co", tin: null, address: null, phone: null, email: null, isActive: true }] : [],
            total: created ? 1 : 0,
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
    await screen.findByText(/no customers yet/i);

    await user.click(screen.getByRole("button", { name: /add customer/i }));
    await user.type(screen.getByLabelText("Name"), "New Co");
    await user.click(screen.getByRole("button", { name: /save customer/i }));

    await waitFor(() => expect(screen.getByText("New Co")).toBeInTheDocument());
  });

  it("deactivates a customer after confirming", async () => {
    let isActive = true;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/customers/c1") && init?.method === "PATCH") {
        isActive = false;
        return new Response(JSON.stringify({ customer: { id: "c1", name: "Kigali Traders", isActive } }), {
          status: 200,
        });
      }
      if (url.includes("/customers")) {
        return new Response(
          JSON.stringify({
            results: isActive
              ? [{ id: "c1", name: "Kigali Traders", tin: null, address: null, phone: null, email: null, isActive: true }]
              : [],
            total: isActive ? 1 : 0,
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

    await user.click(screen.getByRole("button", { name: /deactivate/i }));

    await waitFor(() => expect(screen.getByText(/no customers yet/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=client -- Customers.test.tsx`
Expected: FAIL, `./Customers` does not exist.

- [ ] **Step 3: Implement**

`client/src/pages/Customers.tsx`:

```tsx
import { useState } from "react";
import { AppLayout } from "../components/AppLayout";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { CustomerForm, type CustomerFormValues, type CustomerSubmitValues } from "../components/customers/CustomerForm";
import { apiRequest, ApiError } from "../lib/apiClient";
import { usePaginatedList } from "../lib/usePaginatedList";

interface Customer {
  id: string;
  name: string;
  tin: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
}

type SortBy = "name" | "createdAt";

export default function Customers() {
  const list = usePaginatedList<Customer, SortBy>({ resourcePath: "/customers", defaultSortBy: "createdAt" });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreateModal() {
    setEditingCustomer(null);
    setFormError(null);
    setIsModalOpen(true);
  }

  function openEditModal(customer: Customer) {
    setEditingCustomer(customer);
    setFormError(null);
    setIsModalOpen(true);
  }

  async function handleSubmit(values: CustomerSubmitValues) {
    setIsSaving(true);
    setFormError(null);
    try {
      if (editingCustomer) {
        await apiRequest(`/customers/${editingCustomer.id}`, { method: "PATCH", body: values });
      } else {
        await apiRequest("/customers", { method: "POST", body: values });
      }
      setIsModalOpen(false);
      list.reload();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? "Couldn't save that customer. Try again." : "Something went wrong. Try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(customer: Customer) {
    if (
      customer.isActive &&
      !window.confirm(`Deactivate ${customer.name}? They'll be hidden from new documents until reactivated.`)
    ) {
      return;
    }
    await apiRequest(`/customers/${customer.id}`, { method: "PATCH", body: { isActive: !customer.isActive } });
    list.reload();
  }

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const editingValues: CustomerFormValues | undefined = editingCustomer
    ? {
        name: editingCustomer.name,
        tin: editingCustomer.tin ?? undefined,
        address: editingCustomer.address ?? undefined,
        phone: editingCustomer.phone ?? undefined,
        email: editingCustomer.email ?? undefined,
      }
    : undefined;

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-neutral-900">Customers</h1>
          <Button type="button" onClick={openCreateModal} className="w-auto px-5">
            Add customer
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <input
            type="text"
            placeholder="Search customers"
            value={list.search}
            onChange={(event) => list.updateSearch(event.target.value)}
            className="w-full max-w-xs rounded-lg border border-neutral-200 px-3.5 py-2 font-sans text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
          <label className="flex items-center gap-2 font-sans text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={list.includeInactive}
              onChange={(event) => list.updateIncludeInactive(event.target.checked)}
            />
            Show inactive
          </label>
        </div>

        {list.error && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {list.error}
          </div>
        )}

        {list.isLoading ? (
          <div className="flex flex-col gap-2" aria-label="Loading customers">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-100" />
            ))}
          </div>
        ) : list.results.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
            <p className="font-sans text-sm text-neutral-600">No customers yet.</p>
            <Button type="button" onClick={openCreateModal} className="w-auto px-5">
              Add customer
            </Button>
          </div>
        ) : (
          <table className="w-full border-collapse font-sans text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="cursor-pointer py-2" onClick={() => list.toggleSort("name")}>
                  Name {list.sortBy === "name" && (list.sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th className="py-2">Phone</th>
                <th className="py-2">Email</th>
                <th className="py-2">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {list.results.map((customer) => (
                <tr key={customer.id} className={`border-b border-neutral-100 ${customer.isActive ? "" : "opacity-50"}`}>
                  <td className="cursor-pointer py-3" onClick={() => openEditModal(customer)}>
                    {customer.name}
                  </td>
                  <td className="py-3 text-neutral-600">{customer.phone ?? "-"}</td>
                  <td className="py-3 text-neutral-600">{customer.email ?? "-"}</td>
                  <td className="py-3 text-neutral-600">{customer.isActive ? "Active" : "Inactive"}</td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(customer)}
                      className="font-sans text-sm text-neutral-500 hover:text-neutral-700 hover:underline"
                    >
                      {customer.isActive ? "Deactivate" : "Reactivate"}
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

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCustomer ? "Edit customer" : "Add customer"}
      >
        <CustomerForm initialValues={editingValues} isSubmitting={isSaving} apiError={formError} onSubmit={handleSubmit} />
      </Modal>
    </AppLayout>
  );
}
```

Modify `client/src/App.tsx`, add the import and route inside the `ProtectedRoute` block:

```tsx
import Customers from "./pages/Customers";
```

```tsx
<Route path="/customers" element={<Customers />} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=client -- Customers.test.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Customers.tsx client/src/pages/Customers.test.tsx client/src/App.tsx
git commit -m "add Customers list page"
```

---

### Task 11: ItemForm

**Files:**
- Create: `client/src/components/items/ItemForm.tsx`
- Test: `client/src/components/items/ItemForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ItemForm } from "./ItemForm";

describe("ItemForm", () => {
  it("renders with the first preset unit selected by default", () => {
    render(<ItemForm isSubmitting={false} apiError={null} onSubmit={() => {}} />);
    expect(screen.getByLabelText("Description")).toHaveValue("");
    expect(screen.getByLabelText("Unit")).toHaveValue("piece");
  });

  it("requires a description", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ItemForm isSubmitting={false} apiError={null} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /save item/i }));

    expect(await screen.findByText(/enter a description/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits with a preset unit", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ItemForm isSubmitting={false} apiError={null} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Description"), "Printing service");
    await user.type(screen.getByLabelText("Unit price (RWF)"), "5000");
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "service" } });
    await user.click(screen.getByRole("button", { name: /save item/i }));

    expect(onSubmit).toHaveBeenCalledWith({ description: "Printing service", unitPrice: 5000, unit: "service" });
  });

  it("reveals a custom unit field when 'Other' is selected and submits its value", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ItemForm isSubmitting={false} apiError={null} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Description"), "Custom crate");
    await user.type(screen.getByLabelText("Unit price (RWF)"), "2000");
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "other" } });
    await user.type(screen.getByLabelText("Custom unit"), "crate");
    await user.click(screen.getByRole("button", { name: /save item/i }));

    expect(onSubmit).toHaveBeenCalledWith({ description: "Custom crate", unitPrice: 2000, unit: "crate" });
  });

  it("pre-fills from initialValues and shows the custom field when the unit isn't a preset", () => {
    render(
      <ItemForm
        initialValues={{ description: "Custom crate", unitPrice: 2000, unit: "crate" }}
        isSubmitting={false}
        apiError={null}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByLabelText("Description")).toHaveValue("Custom crate");
    expect(screen.getByLabelText("Custom unit")).toHaveValue("crate");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=client -- ItemForm.test.tsx`
Expected: FAIL, `./ItemForm` does not exist.

- [ ] **Step 3: Implement**

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { itemSchema, type ItemInput } from "@billa/shared";
import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { Button } from "../Button";
import { FormField } from "../FormField";

const UNIT_OPTIONS = ["piece", "kg", "liter", "hour", "day", "service", "box"] as const;

export interface ItemFormValues {
  description: string;
  unitPrice: number;
  unit: string;
}

interface ItemFormProps {
  initialValues?: ItemFormValues;
  isSubmitting: boolean;
  apiError: string | null;
  onSubmit: (values: ItemInput) => void;
}

export function ItemForm({ initialValues, isSubmitting, apiError, onSubmit }: ItemFormProps) {
  const initialIsPreset = initialValues
    ? (UNIT_OPTIONS as readonly string[]).includes(initialValues.unit)
    : true;
  const [useCustomUnit, setUseCustomUnit] = useState(!initialIsPreset);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ItemInput>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      description: initialValues?.description ?? "",
      unitPrice: initialValues?.unitPrice,
      unit: initialValues?.unit ?? UNIT_OPTIONS[0],
    },
  });

  function handleUnitSelectChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    if (value === "other") {
      setUseCustomUnit(true);
      setValue("unit", "");
    } else {
      setUseCustomUnit(false);
      setValue("unit", value);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-5" noValidate>
      {apiError && (
        <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
          {apiError}
        </div>
      )}
      <FormField
        id="description"
        label="Description"
        type="text"
        error={errors.description?.message}
        {...register("description")}
      />
      <FormField
        id="unitPrice"
        label="Unit price (RWF)"
        type="number"
        error={errors.unitPrice?.message}
        {...register("unitPrice", { valueAsNumber: true })}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="unitSelect" className="font-sans text-sm font-medium text-neutral-800">
          Unit
        </label>
        <select
          id="unitSelect"
          defaultValue={useCustomUnit ? "other" : (initialValues?.unit ?? UNIT_OPTIONS[0])}
          onChange={handleUnitSelectChange}
          className="rounded-lg border border-neutral-200 px-3.5 py-2.5 font-sans text-sm text-neutral-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        >
          {UNIT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value="other">Other</option>
        </select>
        {useCustomUnit && (
          <FormField id="unit" label="Custom unit" type="text" error={errors.unit?.message} {...register("unit")} />
        )}
      </div>
      <Button type="submit" isLoading={isSubmitting}>
        Save item
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=client -- ItemForm.test.tsx`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/items/ItemForm.tsx client/src/components/items/ItemForm.test.tsx
git commit -m "add ItemForm"
```

---

### Task 12: Items page

**Files:**
- Create: `client/src/pages/Items.tsx`
- Test: `client/src/pages/Items.test.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Items from "./Items";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderItems() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Items />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Items", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the empty state when there are no items", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes("/items")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    renderItems();

    expect(await screen.findByText(/no items yet/i)).toBeInTheDocument();
  });

  it("renders a list of items with formatted prices", async () => {
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

    renderItems();

    expect(await screen.findByText("Printing service")).toBeInTheDocument();
    expect(screen.getByText("5,000 RWF")).toBeInTheDocument();
  });

  it("creates an item through the modal and refreshes the list", async () => {
    let created = false;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/items") && init?.method === "POST") {
        created = true;
        return new Response(JSON.stringify({ item: { id: "i1", description: "New item" } }), { status: 201 });
      }
      if (url.includes("/items")) {
        return new Response(
          JSON.stringify({
            results: created
              ? [{ id: "i1", description: "New item", unitPrice: 1000, unit: "piece", isActive: true }]
              : [],
            total: created ? 1 : 0,
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
    await screen.findByText(/no items yet/i);

    await user.click(screen.getByRole("button", { name: /add item/i }));
    await user.type(screen.getByLabelText("Description"), "New item");
    await user.type(screen.getByLabelText("Unit price (RWF)"), "1000");
    await user.click(screen.getByRole("button", { name: /save item/i }));

    await waitFor(() => expect(screen.getByText("New item")).toBeInTheDocument());
  });

  it("deactivates an item after confirming", async () => {
    let isActive = true;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes("/items/i1") && init?.method === "PATCH") {
        isActive = false;
        return new Response(JSON.stringify({ item: { id: "i1", description: "Printing service", isActive } }), {
          status: 200,
        });
      }
      if (url.includes("/items")) {
        return new Response(
          JSON.stringify({
            results: isActive
              ? [{ id: "i1", description: "Printing service", unitPrice: 5000, unit: "service", isActive: true }]
              : [],
            total: isActive ? 1 : 0,
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

    await user.click(screen.getByRole("button", { name: /deactivate/i }));

    await waitFor(() => expect(screen.getByText(/no items yet/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=client -- Items.test.tsx`
Expected: FAIL, `./Items` does not exist.

- [ ] **Step 3: Implement**

`client/src/pages/Items.tsx`:

```tsx
import { useState } from "react";
import { AppLayout } from "../components/AppLayout";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { ItemForm, type ItemFormValues } from "../components/items/ItemForm";
import { apiRequest, ApiError } from "../lib/apiClient";
import { formatRwf } from "../lib/money";
import { usePaginatedList } from "../lib/usePaginatedList";

interface Item {
  id: string;
  description: string;
  unitPrice: number;
  unit: string;
  isActive: boolean;
}

type SortBy = "description" | "unitPrice" | "createdAt";

export default function Items() {
  const list = usePaginatedList<Item, SortBy>({ resourcePath: "/items", defaultSortBy: "createdAt" });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreateModal() {
    setEditingItem(null);
    setFormError(null);
    setIsModalOpen(true);
  }

  function openEditModal(item: Item) {
    setEditingItem(item);
    setFormError(null);
    setIsModalOpen(true);
  }

  async function handleSubmit(values: ItemFormValues) {
    setIsSaving(true);
    setFormError(null);
    try {
      if (editingItem) {
        await apiRequest(`/items/${editingItem.id}`, { method: "PATCH", body: values });
      } else {
        await apiRequest("/items", { method: "POST", body: values });
      }
      setIsModalOpen(false);
      list.reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? "Couldn't save that item. Try again." : "Something went wrong. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(item: Item) {
    if (
      item.isActive &&
      !window.confirm(`Deactivate ${item.description}? It'll be hidden from new documents until reactivated.`)
    ) {
      return;
    }
    await apiRequest(`/items/${item.id}`, { method: "PATCH", body: { isActive: !item.isActive } });
    list.reload();
  }

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const editingValues: ItemFormValues | undefined = editingItem
    ? { description: editingItem.description, unitPrice: editingItem.unitPrice, unit: editingItem.unit }
    : undefined;

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-neutral-900">Items</h1>
          <Button type="button" onClick={openCreateModal} className="w-auto px-5">
            Add item
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <input
            type="text"
            placeholder="Search items"
            value={list.search}
            onChange={(event) => list.updateSearch(event.target.value)}
            className="w-full max-w-xs rounded-lg border border-neutral-200 px-3.5 py-2 font-sans text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
          <label className="flex items-center gap-2 font-sans text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={list.includeInactive}
              onChange={(event) => list.updateIncludeInactive(event.target.checked)}
            />
            Show inactive
          </label>
        </div>

        {list.error && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {list.error}
          </div>
        )}

        {list.isLoading ? (
          <div className="flex flex-col gap-2" aria-label="Loading items">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-100" />
            ))}
          </div>
        ) : list.results.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 py-16 text-center">
            <p className="font-sans text-sm text-neutral-600">No items yet.</p>
            <Button type="button" onClick={openCreateModal} className="w-auto px-5">
              Add item
            </Button>
          </div>
        ) : (
          <table className="w-full border-collapse font-sans text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="cursor-pointer py-2" onClick={() => list.toggleSort("description")}>
                  Description {list.sortBy === "description" && (list.sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th className="cursor-pointer py-2" onClick={() => list.toggleSort("unitPrice")}>
                  Price {list.sortBy === "unitPrice" && (list.sortOrder === "asc" ? "↑" : "↓")}
                </th>
                <th className="py-2">Unit</th>
                <th className="py-2">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {list.results.map((item) => (
                <tr key={item.id} className={`border-b border-neutral-100 ${item.isActive ? "" : "opacity-50"}`}>
                  <td className="cursor-pointer py-3" onClick={() => openEditModal(item)}>
                    {item.description}
                  </td>
                  <td className="py-3 text-neutral-600">{formatRwf(item.unitPrice)}</td>
                  <td className="py-3 text-neutral-600">{item.unit}</td>
                  <td className="py-3 text-neutral-600">{item.isActive ? "Active" : "Inactive"}</td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(item)}
                      className="font-sans text-sm text-neutral-500 hover:text-neutral-700 hover:underline"
                    >
                      {item.isActive ? "Deactivate" : "Reactivate"}
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

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? "Edit item" : "Add item"}>
        <ItemForm initialValues={editingValues} isSubmitting={isSaving} apiError={formError} onSubmit={handleSubmit} />
      </Modal>
    </AppLayout>
  );
}
```

Modify `client/src/App.tsx`, add the import and route inside the `ProtectedRoute` block:

```tsx
import Items from "./pages/Items";
```

```tsx
<Route path="/items" element={<Items />} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=client -- Items.test.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Items.tsx client/src/pages/Items.test.tsx client/src/App.tsx
git commit -m "add Items list page"
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

1. Log in (or register a fresh account) and land on the dashboard. Confirm the top bar shows Customers/Items links and a Log out button.
2. Go to Customers. Confirm the empty state and "Add customer" button render.
3. Add a customer with just a name, then add a second with a name, phone, and email. Confirm both appear in the list.
4. Search for one by name, confirm the list filters. Clear the search.
5. Click a column header to sort, confirm the order changes and the arrow indicator flips on a second click.
6. Deactivate one customer, confirm the browser's confirm dialog appears, accept it, and confirm the customer drops out of the default list. Toggle "Show inactive" and confirm it reappears dimmed with a "Reactivate" action.
7. Click a customer row, confirm the edit panel opens pre-filled, change a field, save, confirm the list reflects the change.
8. Repeat steps 3, 6, and 7 for Items, including a custom (non-preset) unit, and confirm prices render as "X,XXX RWF".
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

- **Spec coverage:** backend API shape (Tasks 1-4), app shell (Task 7), list screens with search/sort/pagination/deactivate/empty-state/loading-state (Tasks 8, 10, 12), create/edit panel (Tasks 6, 9, 10, 11, 12). All spec sections have a corresponding task.
- **Deviation from spec, decided during plan-writing:** list endpoints return a generic `{ results, total, page, pageSize }` envelope instead of resource-named keys (`{ customers }` / `{ items }`). This wasn't spelled out in the spec's endpoint table but is what makes `usePaginatedList` shareable between both pages instead of duplicating the same fetch/debounce/sort/pagination logic twice. Single-resource POST/PATCH responses keep resource-named keys (`{ customer }`, `{ item }`), unaffected.
- **Type consistency checked:** `onSubmit` payload shapes match between each form component and the page that calls it (`CustomerSubmitValues` in `CustomerForm.tsx` matches what `Customers.tsx` sends; `ItemInput` from `@billa/shared` is used directly by both `ItemForm.tsx` and `Items.tsx`). `usePaginatedList`'s generic `SortByT` is instantiated consistently as `"name" | "createdAt"` for customers and `"description" | "unitPrice" | "createdAt"` for items, matching the `sortBy` enum values in each shared list-query schema. `req.listQuery` (set in Task 2) is read the same way in both `customers.ts` and `items.ts` (Tasks 3-4).
