# Team Collaboration Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a real access-revocation bug on member removal, add a team-wide activity log (with a personal "my activity" filter), and let owners recover/resend pending invite links — the three pieces scoped in [2026-08-25-team-collaboration-hardening-design.md](../specs/2026-08-25-team-collaboration-hardening-design.md).

**Architecture:** Server: one new Prisma model (`ActivityLogEntry`) plus a small `logActivity()` helper called inline from existing route handlers after their mutations succeed; two small correctness fixes in `auth.ts`/`business.ts`; two new/changed routes for invite recovery. Client: a shared clipboard helper (extracted from the existing 2FA backup-codes copy button), a new paginated `/activity` page reusing the existing `usePaginatedList` hook, and additions to the existing `TeamSection` component.

**Tech Stack:** Express + Prisma (Postgres) on the server, React + Vite + Tailwind on the client, Vitest + Supertest/RTL for tests — all matching the existing codebase, no new dependencies.

---

## File Structure

**New files:**
- `server/prisma/migrations/20260825093715_activity_log/migration.sql` — hand-written migration for `ActivityLogEntry` + `ActivityAction` enum (Prisma migrate can't run non-interactively in this environment; every prior migration this session was hand-written the same way).
- `server/src/lib/activity-log.ts` — `logActivity()` helper, the single write path for the new table.
- `server/src/lib/activity-log.test.ts` — unit test for the helper.
- `shared/src/activity-schemas.ts` — `activityListQuerySchema`, mirroring the existing `contactListQuerySchema` pagination pattern.
- `shared/src/activity-schemas.test.ts`
- `server/src/routes/business.activity.test.ts` — tests for `GET /business/activity`.
- `server/src/routes/business.member-removal-access.test.ts` — tests for the session-revocation fix.
- `server/src/routes/documents.activity-log.test.ts` — activity-log assertions for document create/finalize/delete.
- `server/src/routes/customers.activity-log.test.ts` — activity-log assertions for customer create/deactivate.
- `client/src/lib/clipboard.ts` — `copyToClipboard()`, extracted from `TwoFactorSection.tsx` so `TeamSection.tsx` can reuse it.
- `client/src/lib/clipboard.test.ts`
- `client/src/lib/activityLabels.ts` — `describeActivity()`, turns an activity log row into a human sentence.
- `client/src/lib/activityLabels.test.ts`
- `client/src/pages/Activity.tsx` — the new `/activity` page.
- `client/src/pages/Activity.test.tsx`

**Modified files:**
- `server/prisma/schema.prisma` — add `ActivityAction` enum, `ActivityLogEntry` model, relation fields on `Business`/`User`.
- `server/src/test/db.ts` — clean up `ActivityLogEntry` rows in `resetDb()`.
- `server/src/routes/auth.ts` — `/session` existing-user branch re-validates `lastActiveBusinessId` via `hasBusinessAccess` before trusting it.
- `server/src/routes/business.ts` — member removal revokes refresh tokens + clears `lastActiveBusinessId` + logs `MEMBER_REMOVED`; invite creation logs `MEMBER_INVITED`; `GET /invites` returns each invite's link; new `POST /invites/:id/resend`; new `GET /activity`.
- `server/src/routes/invites.ts` — accept flow logs `MEMBER_JOINED`.
- `server/src/routes/documents.ts` — create/finalize/delete log activity.
- `server/src/routes/customers.ts` — create logs activity; PATCH with `isActive: false` logs a deactivation.
- `server/src/routes/business.members-invites.test.ts` — add cases for the `link` field, resend, and refresh-token revocation.
- `shared/src/index.ts` — export the new activity schema module.
- `client/src/components/business/TwoFactorSection.tsx` — use the extracted `copyToClipboard()` instead of its own inline copy logic.
- `client/src/components/business/TeamSection.tsx` — pending invites show a "Copy link" and "Resend" action.
- `client/src/components/business/TeamSection.test.tsx` — cover the new buttons.
- `client/src/App.tsx` — lazy-import and route `/activity`.
- `client/src/components/Sidebar.tsx` — nav link to Activity.
- `client/src/components/Sidebar.test.tsx` — assert the new link renders.

---

## Task 1: `ActivityLogEntry` schema and migration

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260825093715_activity_log/migration.sql`

- [ ] **Step 1: Add the enum and model to the schema**

In `server/prisma/schema.prisma`, add this enum near the other enums (after `RecurrenceInterval`):

```prisma
enum ActivityAction {
  DOCUMENT_CREATED
  DOCUMENT_FINALIZED
  DOCUMENT_DELETED
  CUSTOMER_CREATED
  CUSTOMER_DEACTIVATED
  MEMBER_INVITED
  MEMBER_JOINED
  MEMBER_REMOVED
}
```

Add this model after `BusinessInvite`:

```prisma
model ActivityLogEntry {
  id          String         @id @default(cuid())
  businessId  String
  actorUserId String
  action      ActivityAction
  entityType  String
  entityId    String
  metadata    Json?
  createdAt   DateTime       @default(now())

  business Business @relation(fields: [businessId], references: [id])
  actor    User     @relation(fields: [actorUserId], references: [id])

  @@index([businessId, createdAt])
  @@index([actorUserId])
}
```

In the `Business` model, add `activityLog ActivityLogEntry[]` to the relations block (alongside `members`/`invites`):

```prisma
  members     BusinessMember[]
  invites     BusinessInvite[]
  activityLog ActivityLogEntry[]
```

In the `User` model, add `activityLog ActivityLogEntry[]` to the relations block (alongside `memberships`):

```prisma
  memberships BusinessMember[]
  activityLog ActivityLogEntry[]
```

- [ ] **Step 2: Write the migration by hand**

Create `server/prisma/migrations/20260825093715_activity_log/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('DOCUMENT_CREATED', 'DOCUMENT_FINALIZED', 'DOCUMENT_DELETED', 'CUSTOMER_CREATED', 'CUSTOMER_DEACTIVATED', 'MEMBER_INVITED', 'MEMBER_JOINED', 'MEMBER_REMOVED');

-- CreateTable
CREATE TABLE "ActivityLogEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" "ActivityAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityLogEntry_businessId_createdAt_idx" ON "ActivityLogEntry"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLogEntry_actorUserId_idx" ON "ActivityLogEntry"("actorUserId");

-- AddForeignKey
ALTER TABLE "ActivityLogEntry" ADD CONSTRAINT "ActivityLogEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLogEntry" ADD CONSTRAINT "ActivityLogEntry_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 3: Apply the migration to both databases and regenerate the client**

Run (from `server/`):

```bash
npx prisma migrate deploy
```

Expected: `Applying migration \`20260825093715_activity_log\`` then `All migrations have been successfully applied.`

Then apply to the test database and regenerate the client:

```bash
DATABASE_URL=$(grep DATABASE_URL .env.test | cut -d '=' -f2- | tr -d '"') npx prisma migrate deploy
npx prisma generate
```

- [ ] **Step 4: Clean up the new table in `resetDb()`**

In `server/src/test/db.ts`, add a line before the `business.deleteMany()` call (FK order — `ActivityLogEntry` references both `Business` and `User`):

```ts
export async function resetDb() {
  await prisma.contactMessage.deleteMany();
  await prisma.documentLine.deleteMany();
  await prisma.document.deleteMany();
  await prisma.documentSequence.deleteMany();
  await prisma.item.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.twoFactorChallenge.deleteMany();
  await prisma.businessMember.deleteMany();
  await prisma.businessInvite.deleteMany();
  await prisma.activityLogEntry.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.business.deleteMany();
  await prisma.user.deleteMany();
}
```

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260825093715_activity_log/ server/src/test/db.ts
git commit -m "add ActivityLogEntry schema"
```

---

## Task 2: `logActivity()` helper

**Files:**
- Create: `server/src/lib/activity-log.ts`
- Test: `server/src/lib/activity-log.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/activity-log.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { resetDb } from "../test/db.js";
import { logActivity } from "./activity-log.js";

beforeEach(resetDb);

async function setupBusiness() {
  const user = await prisma.user.create({
    data: { email: "owner@example.com", firebaseUid: "firebase-uid-1", trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
  });
  const business = await prisma.business.create({ data: { ownerId: user.id, name: "Kigali Traders" } });
  return { user, business };
}

describe("logActivity", () => {
  it("writes a row with the given fields", async () => {
    const { user, business } = await setupBusiness();

    await logActivity({
      businessId: business.id,
      actorUserId: user.id,
      action: "DOCUMENT_CREATED",
      entityType: "Document",
      entityId: "doc-1",
      metadata: { type: "INVOICE" },
    });

    const rows = await prisma.activityLogEntry.findMany({ where: { businessId: business.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      businessId: business.id,
      actorUserId: user.id,
      action: "DOCUMENT_CREATED",
      entityType: "Document",
      entityId: "doc-1",
      metadata: { type: "INVOICE" },
    });
  });

  it("writes a row with no metadata", async () => {
    const { user, business } = await setupBusiness();

    await logActivity({
      businessId: business.id,
      actorUserId: user.id,
      action: "MEMBER_JOINED",
      entityType: "BusinessMember",
      entityId: "member-1",
    });

    const rows = await prisma.activityLogEntry.findMany({ where: { businessId: business.id } });
    expect(rows[0].metadata).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/activity-log.test.ts` (from `server/`)
Expected: FAIL — `Cannot find module './activity-log.js'`

- [ ] **Step 3: Implement the helper**

Create `server/src/lib/activity-log.ts`:

```ts
import type { ActivityAction } from "@prisma/client";
import { prisma } from "./prisma.js";

export interface LogActivityInput {
  businessId: string;
  actorUserId: string;
  action: ActivityAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export async function logActivity(input: LogActivityInput): Promise<void> {
  await prisma.activityLogEntry.create({
    data: {
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/activity-log.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/activity-log.ts server/src/lib/activity-log.test.ts
git commit -m "add logActivity helper"
```

---

## Task 3: Session revocation on member removal

**Files:**
- Modify: `server/src/routes/business.ts` (member removal handler)
- Modify: `server/src/routes/auth.ts` (`/session` existing-user branch)
- Test: `server/src/routes/business.member-removal-access.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/routes/business.member-removal-access.test.ts`:

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

async function registerAndGetCookies(app: ReturnType<typeof createApp>, email: string, businessName: string) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: email, email }),
    businessName,
  });
  return { cookies: res.headers["set-cookie"] as unknown as string[], userId: res.body.user.id as string };
}

describe("removing a member revokes their access", () => {
  it("revokes the removed member's refresh tokens for that business", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const businessId = ownerRes.body.business.id as string;
    const { cookies: memberCookies, userId: memberId } = await registerAndGetCookies(
      app,
      "member@example.com",
      "Member's Own Biz",
    );
    await prisma.businessMember.create({ data: { businessId, userId: memberId } });
    const switchRes = await request(app).post("/auth/switch-business").set("Cookie", memberCookies).send({ businessId });
    const memberBusinessCookies = switchRes.headers["set-cookie"] as unknown as string[];

    await request(app).delete(`/business/members/${memberId}`).set("Cookie", ownerCookies);

    const refreshCookie = memberBusinessCookies.find((c) => c.startsWith("refresh_token"));
    const refreshRes = await request(app).post("/auth/refresh").set("Cookie", [refreshCookie!]);
    expect(refreshRes.status).toBe(401);
  });

  it("clears lastActiveBusinessId when it pointed at the business the member was removed from", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const businessId = ownerRes.body.business.id as string;
    const { cookies: memberCookies, userId: memberId } = await registerAndGetCookies(
      app,
      "member@example.com",
      "Member's Own Biz",
    );
    await prisma.businessMember.create({ data: { businessId, userId: memberId } });
    await request(app).post("/auth/switch-business").set("Cookie", memberCookies).send({ businessId });

    await request(app).delete(`/business/members/${memberId}`).set("Cookie", ownerCookies);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
    expect(user.lastActiveBusinessId).not.toBe(businessId);
  });

  it("a fresh login for the removed member falls back to their own business instead of the one they lost access to", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const businessId = ownerRes.body.business.id as string;
    const { cookies: memberCookies, userId: memberId } = await registerAndGetCookies(
      app,
      "member@example.com",
      "Member's Own Biz",
    );
    await prisma.businessMember.create({ data: { businessId, userId: memberId } });
    await request(app).post("/auth/switch-business").set("Cookie", memberCookies).send({ businessId });
    await request(app).delete(`/business/members/${memberId}`).set("Cookie", ownerCookies);

    const loginRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "member@example.com", email: "member@example.com" }),
    });

    expect(loginRes.body.business.name).toBe("Member's Own Biz");
  });

  it("leaves lastActiveBusinessId and refresh tokens alone when they point at a different business", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const businessId = ownerRes.body.business.id as string;
    const { userId: memberId } = await registerAndGetCookies(app, "member@example.com", "Member's Own Biz");
    await prisma.businessMember.create({ data: { businessId, userId: memberId } });

    await request(app).delete(`/business/members/${memberId}`).set("Cookie", ownerCookies);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
    const ownBusiness = await prisma.business.findFirstOrThrow({ where: { ownerId: memberId } });
    expect(user.lastActiveBusinessId).toBe(ownBusiness.id);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/routes/business.member-removal-access.test.ts` (from `server/`)
Expected: FAIL — the refresh token still works (401 expected, gets 200) and `lastActiveBusinessId` is unchanged.

- [ ] **Step 3: Fix the member removal handler**

In `server/src/routes/business.ts`, replace the `DELETE /members/:userId` handler:

```ts
businessRouter.delete("/members/:userId", requireOwner, async (req, res) => {
  const businessId = req.auth!.businessId;
  const { userId } = req.params;

  const removedUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, lastActiveBusinessId: true },
  });

  const deleted = await prisma.businessMember.deleteMany({ where: { businessId, userId } });
  if (deleted.count === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  await prisma.refreshToken.updateMany({
    where: { userId, businessId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (removedUser?.lastActiveBusinessId === businessId) {
    await prisma.user.update({ where: { id: userId }, data: { lastActiveBusinessId: null } });
  }

  await logActivity({
    businessId,
    actorUserId: req.auth!.userId,
    action: "MEMBER_REMOVED",
    entityType: "BusinessMember",
    entityId: userId,
    metadata: removedUser ? { email: removedUser.email } : undefined,
  });

  res.json({ ok: true });
});
```

Add the import at the top of `server/src/routes/business.ts`:

```ts
import { logActivity } from "../lib/activity-log.js";
```

- [ ] **Step 4: Fix `/auth/session`'s existing-user branch**

In `server/src/routes/auth.ts`, replace this block:

```ts
  const existing = await prisma.user.findUnique({ where: { firebaseUid: firebaseUser.uid } });
  if (existing) {
    let businessId = existing.lastActiveBusinessId;
    if (!businessId) {
      const firstBusiness = await prisma.business.findFirstOrThrow({
        where: { ownerId: existing.id },
        orderBy: { createdAt: "asc" },
      });
      businessId = firstBusiness.id;
    }
```

with:

```ts
  const existing = await prisma.user.findUnique({ where: { firebaseUid: firebaseUser.uid } });
  if (existing) {
    let businessId = existing.lastActiveBusinessId;
    if (businessId && !(await hasBusinessAccess(existing.id, businessId))) {
      businessId = null;
    }
    if (!businessId) {
      const firstBusiness = await prisma.business.findFirstOrThrow({
        where: { ownerId: existing.id },
        orderBy: { createdAt: "asc" },
      });
      businessId = firstBusiness.id;
    }
```

(`hasBusinessAccess` is already imported in this file.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/routes/business.member-removal-access.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the full existing member/invite/switch-business test files to check for regressions**

Run: `npx vitest run src/routes/business.members-invites.test.ts src/routes/business.member-permissions.test.ts src/routes/auth.switch-business.test.ts src/routes/businesses.test.ts`
Expected: PASS (all previously-passing tests still pass)

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/business.ts server/src/routes/auth.ts server/src/routes/business.member-removal-access.test.ts
git commit -m "revoke a removed member's access immediately"
```

---

## Task 4: Instrument documents.ts

**Files:**
- Modify: `server/src/routes/documents.ts`
- Test: `server/src/routes/documents.activity-log.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/routes/documents.activity-log.test.ts`:

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
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return {
    cookies: res.headers["set-cookie"] as unknown as string[],
    businessId: res.body.business.id as string,
  };
}

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[]) {
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
  return res.body.customer.id as string;
}

describe("document routes log activity", () => {
  it("logs DOCUMENT_CREATED", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    await request(app).post("/documents").set("Cookie", cookies).send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-25",
      lines: [{ description: "Item", quantity: 1, unitPrice: 1000, taxRate: 18 }],
    });

    const rows = await prisma.activityLogEntry.findMany({ where: { businessId, action: "DOCUMENT_CREATED" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ type: "INVOICE" });
  });

  it("logs DOCUMENT_FINALIZED", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const createRes = await request(app).post("/documents").set("Cookie", cookies).send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-25",
      lines: [{ description: "Item", quantity: 1, unitPrice: 1000, taxRate: 18 }],
    });

    await request(app).post(`/documents/${createRes.body.document.id}/finalize`).set("Cookie", cookies);

    const rows = await prisma.activityLogEntry.findMany({ where: { businessId, action: "DOCUMENT_FINALIZED" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ type: "INVOICE" });
  });

  it("logs DOCUMENT_DELETED", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const createRes = await request(app).post("/documents").set("Cookie", cookies).send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-25",
      lines: [{ description: "Item", quantity: 1, unitPrice: 1000, taxRate: 18 }],
    });

    await request(app).delete(`/documents/${createRes.body.document.id}`).set("Cookie", cookies);

    const rows = await prisma.activityLogEntry.findMany({ where: { businessId, action: "DOCUMENT_DELETED" } });
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/routes/documents.activity-log.test.ts` (from `server/`)
Expected: FAIL — no rows found for any of the three actions.

- [ ] **Step 3: Instrument the three handlers**

In `server/src/routes/documents.ts`, add the import:

```ts
import { logActivity } from "../lib/activity-log.js";
```

In the `POST "/"` handler, insert before `res.status(201).json({ document });`:

```ts
  await logActivity({
    businessId,
    actorUserId: req.auth!.userId,
    action: "DOCUMENT_CREATED",
    entityType: "Document",
    entityId: document.id,
    metadata: { type: document.type },
  });

```

In the `POST "/:id/finalize"` handler, insert before `res.json({ document: finalized });`:

```ts
  await logActivity({
    businessId,
    actorUserId: req.auth!.userId,
    action: "DOCUMENT_FINALIZED",
    entityType: "Document",
    entityId: finalized.id,
    metadata: { number: finalized.number, type: finalized.type },
  });

```

In the `DELETE "/:id"` handler, insert before `res.status(204).send();`:

```ts
  await logActivity({
    businessId,
    actorUserId: req.auth!.userId,
    action: "DOCUMENT_DELETED",
    entityType: "Document",
    entityId: existing.id,
    metadata: { type: existing.type },
  });

```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/routes/documents.activity-log.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the existing document route tests to check for regressions**

Run: `npx vitest run src/routes/documents.create.test.ts src/routes/documents.finalize.test.ts src/routes/documents.delete.test.ts src/routes/documents.list.test.ts src/routes/documents.get.test.ts src/routes/documents.patch.test.ts src/routes/documents.convert.test.ts src/routes/documents.send.test.ts src/routes/documents.pdf.test.ts src/routes/documents.recurring.test.ts src/routes/documents.overdue.test.ts` (from `server/`)
Expected: PASS (all previously-passing tests still pass — the full suite runs again anyway in Task 12)

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/documents.ts server/src/routes/documents.activity-log.test.ts
git commit -m "log activity for document create, finalize, and delete"
```

---

## Task 5: Instrument customers.ts

**Files:**
- Modify: `server/src/routes/customers.ts`
- Test: `server/src/routes/customers.activity-log.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/routes/customers.activity-log.test.ts`:

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
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return {
    cookies: res.headers["set-cookie"] as unknown as string[],
    businessId: res.body.business.id as string,
  };
}

describe("customer routes log activity", () => {
  it("logs CUSTOMER_CREATED", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app);

    await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });

    const rows = await prisma.activityLogEntry.findMany({ where: { businessId, action: "CUSTOMER_CREATED" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ name: "Acme Ltd" });
  });

  it("logs CUSTOMER_DEACTIVATED when isActive is set to false", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app);
    const createRes = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });

    await request(app)
      .patch(`/customers/${createRes.body.customer.id}`)
      .set("Cookie", cookies)
      .send({ name: "Acme Ltd", isActive: false });

    const rows = await prisma.activityLogEntry.findMany({ where: { businessId, action: "CUSTOMER_DEACTIVATED" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ name: "Acme Ltd" });
  });

  it("does not log a deactivation for an unrelated field update", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app);
    const createRes = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });

    await request(app)
      .patch(`/customers/${createRes.body.customer.id}`)
      .set("Cookie", cookies)
      .send({ name: "Acme Ltd", phone: "0788000000" });

    const rows = await prisma.activityLogEntry.findMany({ where: { businessId, action: "CUSTOMER_DEACTIVATED" } });
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/routes/customers.activity-log.test.ts` (from `server/`)
Expected: FAIL — no rows found.

- [ ] **Step 3: Instrument the handlers**

In `server/src/routes/customers.ts`, add the import:

```ts
import { logActivity } from "../lib/activity-log.js";
```

Replace the `POST "/"` handler:

```ts
customersRouter.post("/", validateBody(customerSchema), async (req, res) => {
  const customer = await prisma.customer.create({
    data: { ...req.body, businessId: req.auth!.businessId },
  });

  await logActivity({
    businessId: req.auth!.businessId,
    actorUserId: req.auth!.userId,
    action: "CUSTOMER_CREATED",
    entityType: "Customer",
    entityId: customer.id,
    metadata: { name: customer.name },
  });

  res.status(201).json({ customer });
});
```

Replace the `PATCH "/:id"` handler:

```ts
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

  if (req.body.isActive === false) {
    await logActivity({
      businessId,
      actorUserId: req.auth!.userId,
      action: "CUSTOMER_DEACTIVATED",
      entityType: "Customer",
      entityId: id,
      metadata: customer ? { name: customer.name } : undefined,
    });
  }

  res.json({ customer });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/routes/customers.activity-log.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/customers.ts server/src/routes/customers.activity-log.test.ts
git commit -m "log activity for customer create and deactivate"
```

---

## Task 6: Instrument invite creation, acceptance, and member removal

Member removal was already instrumented in Task 3. This task covers invite creation and acceptance.

**Files:**
- Modify: `server/src/routes/business.ts` (`POST /invites`)
- Modify: `server/src/routes/invites.ts` (accept)
- Test: add cases to `server/src/routes/business.members-invites.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `server/src/routes/business.members-invites.test.ts`, inside the `describe("POST /business/invites", ...)` block (after the last `it`, before its closing `});`):

```ts

  it("logs MEMBER_INVITED", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", cookies);

    await request(app).post("/business/invites").set("Cookie", cookies).send({ email: "friend@example.com" });

    const rows = await prisma.activityLogEntry.findMany({
      where: { businessId: ownerRes.body.business.id, action: "MEMBER_INVITED" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ email: "friend@example.com" });
  });
```

Add to the `describe("invite accept flow", ...)` block (after the last `it`, before its closing `});`):

```ts

  it("logs MEMBER_JOINED on acceptance", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const createRes = await request(app).post("/business/invites").set("Cookie", ownerCookies).send({
      email: "friend@example.com",
    });
    const token = (createRes.body.link as string).split("/invite/")[1];
    const { cookies: inviteeCookies } = await registerAndGetCookies(app, "friend@example.com", "Friend's Own Biz");

    await request(app).post(`/invites/${token}/accept`).set("Cookie", inviteeCookies);

    const rows = await prisma.activityLogEntry.findMany({
      where: { businessId: ownerRes.body.business.id, action: "MEMBER_JOINED" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ email: "friend@example.com" });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/routes/business.members-invites.test.ts` (from `server/`)
Expected: 2 new FAILs (no activity rows found), rest still pass.

- [ ] **Step 3: Instrument invite creation**

In `server/src/routes/business.ts`, add the import (if not already present from Task 3):

```ts
import { logActivity } from "../lib/activity-log.js";
```

In the `POST "/invites"` handler, insert right after `const invite = await prisma.businessInvite.create({ ... });` and before the `const clientOrigin = ...` line:

```ts
  await logActivity({
    businessId,
    actorUserId: req.auth!.userId,
    action: "MEMBER_INVITED",
    entityType: "BusinessInvite",
    entityId: invite.id,
    metadata: { email: invite.email },
  });

```

- [ ] **Step 4: Instrument invite acceptance**

In `server/src/routes/invites.ts`, add the import:

```ts
import { logActivity } from "../lib/activity-log.js";
```

Replace the `$transaction` call and the lines around it:

```ts
  const [membership] = await prisma.$transaction([
    prisma.businessMember.upsert({
      where: { businessId_userId: { businessId: invite.businessId, userId: user.id } },
      create: { businessId: invite.businessId, userId: user.id },
      update: {},
    }),
    prisma.businessInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
    prisma.user.update({ where: { id: user.id }, data: { lastActiveBusinessId: invite.businessId } }),
  ]);

  await logActivity({
    businessId: invite.businessId,
    actorUserId: user.id,
    action: "MEMBER_JOINED",
    entityType: "BusinessMember",
    entityId: membership.id,
    metadata: { email: user.email },
  });

```

(This replaces the previous `await prisma.$transaction([...]);` line — the transaction now assigns its result to `[membership]` instead of discarding it.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/routes/business.members-invites.test.ts`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/business.ts server/src/routes/invites.ts server/src/routes/business.members-invites.test.ts
git commit -m "log activity for invite creation and acceptance"
```

---

## Task 7: `GET /business/activity`

**Files:**
- Create: `shared/src/activity-schemas.ts`
- Test: `shared/src/activity-schemas.test.ts`
- Modify: `shared/src/index.ts`
- Modify: `server/src/routes/business.ts`
- Test: `server/src/routes/business.activity.test.ts`

- [ ] **Step 1: Write the failing shared-schema test**

Create `shared/src/activity-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { activityListQuerySchema } from "./activity-schemas.js";

describe("activityListQuerySchema", () => {
  it("defaults page, pageSize, sortBy, and sortOrder", () => {
    const result = activityListQuerySchema.parse({});
    expect(result).toMatchObject({ page: 1, pageSize: 20, sortBy: "createdAt", sortOrder: "desc" });
  });

  it("accepts an optional actorUserId filter", () => {
    const result = activityListQuerySchema.parse({ actorUserId: "user-1" });
    expect(result.actorUserId).toBe("user-1");
  });

  it("rejects a pageSize over 100", () => {
    expect(activityListQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/activity-schemas.test.ts` (from `shared/`)
Expected: FAIL — `Cannot find module './activity-schemas.js'`

- [ ] **Step 3: Implement the schema**

Create `shared/src/activity-schemas.ts`:

```ts
import { z } from "zod";

export const activityListQuerySchema = z.object({
  sortBy: z.enum(["createdAt"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  actorUserId: z.string().trim().optional(),
});
export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;
```

Add the export to `shared/src/index.ts`:

```ts
export * from "./activity-schemas.js";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/activity-schemas.test.ts` (from `shared/`)
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing route test**

Create `server/src/routes/business.activity.test.ts`:

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

async function registerAndGetCookies(app: ReturnType<typeof createApp>, email: string, businessName: string) {
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: email, email }),
    businessName,
  });
  return {
    cookies: res.headers["set-cookie"] as unknown as string[],
    userId: res.body.user.id as string,
    businessId: res.body.business.id as string,
  };
}

describe("GET /business/activity", () => {
  it("returns team-wide entries newest first", async () => {
    const app = createApp();
    const { cookies, businessId } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    await request(app).post("/customers").set("Cookie", cookies).send({ name: "First" });
    await request(app).post("/customers").set("Cookie", cookies).send({ name: "Second" });

    const res = await request(app).get("/business/activity").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.results[0].metadata).toMatchObject({ name: "Second" });
    expect(res.body.results[0].actor.email).toBe("owner@example.com");
    void businessId;
  });

  it("filters to one actor with actorUserId", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const { cookies: memberOwnCookies, userId: memberId } = await registerAndGetCookies(
      app,
      "member@example.com",
      "Member's Own Biz",
    );
    await prisma.businessMember.create({ data: { businessId: ownerRes.body.business.id, userId: memberId } });
    const switchRes = await request(app)
      .post("/auth/switch-business")
      .set("Cookie", memberOwnCookies)
      .send({ businessId: ownerRes.body.business.id });
    const memberCookies = switchRes.headers["set-cookie"] as unknown as string[];
    await request(app).post("/customers").set("Cookie", ownerCookies).send({ name: "Owner's customer" });
    await request(app).post("/customers").set("Cookie", memberCookies).send({ name: "Member's customer" });

    const res = await request(app).get(`/business/activity?actorUserId=${memberId}`).set("Cookie", ownerCookies);

    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].metadata).toMatchObject({ name: "Member's customer" });
  });

  it("is readable by a member, not just the owner", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const { cookies: memberOwnCookies, userId: memberId } = await registerAndGetCookies(
      app,
      "member@example.com",
      "Member's Own Biz",
    );
    await prisma.businessMember.create({ data: { businessId: ownerRes.body.business.id, userId: memberId } });
    const switchRes = await request(app)
      .post("/auth/switch-business")
      .set("Cookie", memberOwnCookies)
      .send({ businessId: ownerRes.body.business.id });
    const memberCookies = switchRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).get("/business/activity").set("Cookie", memberCookies);

    expect(res.status).toBe(200);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/business/activity");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/routes/business.activity.test.ts` (from `server/`)
Expected: FAIL — 404, route doesn't exist yet.

- [ ] **Step 7: Implement the route**

In `server/src/routes/business.ts`, change the import line:

```ts
import type { DocumentType as PrismaDocumentType } from "@prisma/client";
```

to:

```ts
import type { DocumentType as PrismaDocumentType, Prisma } from "@prisma/client";
```

Add these imports:

```ts
import { activityListQuerySchema } from "@billa/shared";
import type { ActivityListQuery } from "@billa/shared";
import { validateQuery } from "../middleware/validate-query.js";
```

(`createInviteSchema`/`CreateInviteInput` are already imported from `@billa/shared` — add `activityListQuerySchema` alongside them in the same import statement rather than a second one.)

Add the route at the end of the file, after the `DELETE "/invites/:id"` handler:

```ts

businessRouter.get("/activity", validateQuery(activityListQuerySchema), async (req, res) => {
  const query = req.listQuery as ActivityListQuery;
  const businessId = req.auth!.businessId;

  const where: Prisma.ActivityLogEntryWhereInput = {
    businessId,
    ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
  };

  const [results, total] = await Promise.all([
    prisma.activityLogEntry.findMany({
      where,
      orderBy: { createdAt: query.sortOrder },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { actor: { select: { id: true, email: true } } },
    }),
    prisma.activityLogEntry.count({ where }),
  ]);

  res.json({ results, total, page: query.page, pageSize: query.pageSize });
});
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/routes/business.activity.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 9: Commit**

```bash
git add shared/src/activity-schemas.ts shared/src/activity-schemas.test.ts shared/src/index.ts server/src/routes/business.ts server/src/routes/business.activity.test.ts
git commit -m "add GET /business/activity"
```

---

## Task 8: Invite link recovery — `GET /invites` link + `POST /invites/:id/resend`

**Files:**
- Modify: `server/src/routes/business.ts`
- Test: add cases to `server/src/routes/business.members-invites.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `server/src/routes/business.members-invites.test.ts`. First, add a new `describe` block right after the `describe("DELETE /business/invites/:id", ...)` block:

```ts

describe("GET /business/invites", () => {
  it("includes a working link for each pending invite", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    await request(app).post("/business/invites").set("Cookie", cookies).send({ email: "friend@example.com" });

    const res = await request(app).get("/business/invites").set("Cookie", cookies);

    expect(res.body.invites[0].link).toContain("/invite/");
  });
});

describe("POST /business/invites/:id/resend", () => {
  it("extends the expiry, re-sends the email, and returns the link", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const createRes = await request(app).post("/business/invites").set("Cookie", cookies).send({
      email: "friend@example.com",
    });
    const original = await prisma.businessInvite.findUniqueOrThrow({ where: { id: createRes.body.invite.id } });
    await prisma.businessInvite.update({ where: { id: original.id }, data: { expiresAt: new Date(Date.now() + 1000) } });
    const sendSpy = vi.spyOn(resendModule, "sendEmail").mockResolvedValue();

    const res = await request(app).post(`/business/invites/${original.id}/resend`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.link).toContain("/invite/");
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ to: "friend@example.com" }));
    const updated = await prisma.businessInvite.findUniqueOrThrow({ where: { id: original.id } });
    expect(updated.expiresAt.getTime()).toBeGreaterThan(original.expiresAt.getTime());
  });

  it("returns 404 for an unknown invite", async () => {
    const app = createApp();
    const { cookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");

    const res = await request(app).post("/business/invites/nonexistent/resend").set("Cookie", cookies);

    expect(res.status).toBe(404);
  });

  it("returns 404 for an already-accepted invite", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const createRes = await request(app).post("/business/invites").set("Cookie", ownerCookies).send({
      email: "friend@example.com",
    });
    const token = (createRes.body.link as string).split("/invite/")[1];
    const { cookies: inviteeCookies } = await registerAndGetCookies(app, "friend@example.com", "Friend's Own Biz");
    await request(app).post(`/invites/${token}/accept`).set("Cookie", inviteeCookies);

    const res = await request(app)
      .post(`/business/invites/${createRes.body.invite.id}/resend`)
      .set("Cookie", ownerCookies);

    expect(res.status).toBe(404);
  });

  it("blocks a member from resending an invite", async () => {
    const app = createApp();
    const { cookies: ownerCookies } = await registerAndGetCookies(app, "owner@example.com", "Kigali Traders");
    const ownerRes = await request(app).get("/auth/me").set("Cookie", ownerCookies);
    const createRes = await request(app).post("/business/invites").set("Cookie", ownerCookies).send({
      email: "friend@example.com",
    });
    const { cookies: memberOwnCookies, userId: memberId } = await registerAndGetCookies(
      app,
      "member@example.com",
      "Member's Own Biz",
    );
    await prisma.businessMember.create({ data: { businessId: ownerRes.body.business.id, userId: memberId } });
    const switchRes = await request(app)
      .post("/auth/switch-business")
      .set("Cookie", memberOwnCookies)
      .send({ businessId: ownerRes.body.business.id });
    const memberCookies = switchRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app)
      .post(`/business/invites/${createRes.body.invite.id}/resend`)
      .set("Cookie", memberCookies);

    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/routes/business.members-invites.test.ts` (from `server/`)
Expected: FAIL — `link` is `undefined` on the GET response, and `/resend` 404s (route doesn't exist).

- [ ] **Step 3: Extract a shared invite-email sender and update the routes**

In `server/src/routes/business.ts`, add this helper function right after the `INVITE_TTL_MS` constant declaration:

```ts
async function sendInviteEmail(businessName: string, email: string, link: string): Promise<void> {
  try {
    await sendEmail({
      to: email,
      subject: `You've been invited to join ${businessName} on Billa`,
      html: `<p>You've been invited to join <strong>${businessName}</strong> on Billa.</p><p><a href="${link}">Accept the invite</a></p>`,
    });
  } catch {
    // The invite is already saved; the owner can still share the link manually.
  }
}
```

Replace the `GET "/invites"` handler:

```ts
businessRouter.get("/invites", requireOwner, async (req, res) => {
  const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  const invites = await prisma.businessInvite.findMany({
    where: { businessId: req.auth!.businessId, acceptedAt: null },
    orderBy: { createdAt: "asc" },
  });
  res.json({
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
      link: `${clientOrigin}/invite/${i.token}`,
    })),
  });
});
```

Replace the `POST "/invites"` handler's body from `const invite = await prisma.businessInvite.create` through the `res.status(201).json(...)` line with:

```ts
  const invite = await prisma.businessInvite.create({
    data: { businessId, email, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  });

  await logActivity({
    businessId,
    actorUserId: req.auth!.userId,
    action: "MEMBER_INVITED",
    entityType: "BusinessInvite",
    entityId: invite.id,
    metadata: { email: invite.email },
  });

  const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  const link = `${clientOrigin}/invite/${invite.token}`;
  await sendInviteEmail(business.name, email, link);

  res.status(201).json({ invite: { id: invite.id, email: invite.email, expiresAt: invite.expiresAt }, link });
```

Add the new route after `DELETE "/invites/:id"`:

```ts

businessRouter.post("/invites/:id/resend", requireOwner, async (req, res) => {
  const businessId = req.auth!.businessId;
  const invite = await prisma.businessInvite.findFirst({
    where: { id: req.params.id, businessId, acceptedAt: null },
  });
  if (!invite) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const updated = await prisma.businessInvite.update({
    where: { id: invite.id },
    data: { expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  });

  const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  const link = `${clientOrigin}/invite/${updated.token}`;
  await sendInviteEmail(business.name, updated.email, link);

  res.json({ invite: { id: updated.id, email: updated.email, expiresAt: updated.expiresAt }, link });
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/routes/business.members-invites.test.ts`
Expected: PASS (all tests, including the 6 new ones)

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/business.ts server/src/routes/business.members-invites.test.ts
git commit -m "let owners recover and resend pending invite links"
```

---

## Task 9: Extract shared clipboard helper

**Files:**
- Create: `client/src/lib/clipboard.ts`
- Test: `client/src/lib/clipboard.test.ts`
- Modify: `client/src/components/business/TwoFactorSection.tsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/lib/clipboard.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "./clipboard";

describe("copyToClipboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the async Clipboard API when it succeeds", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    const succeeded = await copyToClipboard("hello");

    expect(succeeded).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand when the Clipboard API is blocked", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("blocked"));
    document.execCommand = vi.fn().mockReturnValue(true);

    const succeeded = await copyToClipboard("hello");

    expect(succeeded).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("returns false when both methods fail", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("blocked"));
    document.execCommand = vi.fn().mockReturnValue(false);

    const succeeded = await copyToClipboard("hello");

    expect(succeeded).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/clipboard.test.ts` (from `client/`)
Expected: FAIL — `Cannot find module './clipboard'`

- [ ] **Step 3: Implement the helper**

Create `client/src/lib/clipboard.ts`:

```ts
function legacyCopy(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let succeeded = false;
  try {
    succeeded = document.execCommand("copy");
  } catch {
    succeeded = false;
  }
  document.body.removeChild(textarea);
  return succeeded;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Some browsers block the async Clipboard API; fall back below.
  }
  return legacyCopy(text);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/clipboard.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Refactor `TwoFactorSection.tsx` to use it**

In `client/src/components/business/TwoFactorSection.tsx`, add the import:

```ts
import { copyToClipboard } from "../../lib/clipboard";
```

Delete the entire `legacyCopy` function (the `function legacyCopy(text: string): boolean { ... }` block).

Replace `copyBackupCodes`:

```ts
  async function copyBackupCodes() {
    if (!backupCodes) return;
    const succeeded = await copyToClipboard(backupCodes.join("\n"));
    if (succeeded) {
      setCodesCopied(true);
    } else {
      setError("Couldn't copy the codes. Select and copy them manually instead.");
    }
  }
```

- [ ] **Step 6: Run the TwoFactorSection tests to verify no regressions**

Run: `npx vitest run src/components/business/TwoFactorSection.test.tsx` (from `client/`)
Expected: PASS (5 tests — these already mock `navigator.clipboard.writeText`/`document.execCommand` directly, so they exercise the same code paths through the new helper without needing changes)

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit` (from `client/`)
Expected: no output

- [ ] **Step 8: Commit**

```bash
git add client/src/lib/clipboard.ts client/src/lib/clipboard.test.ts client/src/components/business/TwoFactorSection.tsx
git commit -m "extract shared clipboard helper from 2FA backup codes"
```

---

## Task 10: `TeamSection.tsx` — copy link and resend

**Files:**
- Modify: `client/src/components/business/TeamSection.tsx`
- Modify: `client/src/components/business/TeamSection.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `client/src/components/business/TeamSection.test.tsx`, inside the first `it` block's fetch mock, change the `/business/invites` GET branch to include a `link`:

Find:
```ts
      if (url.endsWith("/business/invites") && (!init || init.method === undefined || init.method === "GET")) {
        return new Response(JSON.stringify({ invites: [] }), { status: 200 });
      }
```

This stays returning an empty array for the first test (no pending invites needed there) — no change needed for that test.

Add two new `it` blocks at the end of the file, before the final closing `});`:

```ts

  it("copies a pending invite's link", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/business/members")) {
        return new Response(
          JSON.stringify({ members: [{ id: "u1", email: "owner@example.com", role: "owner", joinedAt: "2026-01-01" }] }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business/invites") && (!init || init.method === undefined || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            invites: [
              {
                id: "inv1",
                email: "friend@example.com",
                expiresAt: "2026-02-01",
                createdAt: "2026-01-01",
                link: "http://localhost:5173/invite/tok123",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <TeamSection />
      </AuthProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /copy link/i }));

    expect(writeText).toHaveBeenCalledWith("http://localhost:5173/invite/tok123");
    expect(await screen.findByRole("button", { name: /^copied$/i })).toBeInTheDocument();
  });

  it("resends a pending invite", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/business/members")) {
        return new Response(
          JSON.stringify({ members: [{ id: "u1", email: "owner@example.com", role: "owner", joinedAt: "2026-01-01" }] }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business/invites") && (!init || init.method === undefined || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            invites: [
              { id: "inv1", email: "friend@example.com", expiresAt: "2026-02-01", createdAt: "2026-01-01", link: "http://localhost:5173/invite/tok123" },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/business/invites/inv1/resend") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            invite: { id: "inv1", email: "friend@example.com", expiresAt: "2026-03-01" },
            link: "http://localhost:5173/invite/tok123",
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <TeamSection />
      </AuthProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /^resend$/i }));

    expect(await screen.findByText(/invite sent/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/business/TeamSection.test.tsx` (from `client/`)
Expected: FAIL — no "Copy link"/"Resend" buttons exist yet.

- [ ] **Step 3: Implement the buttons**

In `client/src/components/business/TeamSection.tsx`, add the import:

```ts
import { copyToClipboard } from "../../lib/clipboard";
```

Update the `Invite` interface:

```ts
interface Invite {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  link: string;
}
```

Add two new pieces of state alongside the existing ones:

```ts
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
```

Add two new functions after `revokeInvite`:

```ts
  async function copyInviteLink(invite: Invite) {
    setError(null);
    const succeeded = await copyToClipboard(invite.link);
    if (succeeded) {
      setCopiedInviteId(invite.id);
    } else {
      setError("Couldn't copy the link. Select and copy it manually instead.");
    }
  }

  async function resendInvite(id: string) {
    setError(null);
    setResendingId(id);
    try {
      const data = await apiRequest<{ invite: Invite; link: string }>(`/business/invites/${id}/resend`, {
        method: "POST",
      });
      setInvites((prev) => prev?.map((i) => (i.id === id ? { ...data.invite, link: data.link } : i)) ?? null);
      setSuccessLink(data.link);
    } catch {
      setError("Couldn't resend the invite. Try again.");
    } finally {
      setResendingId(null);
    }
  }
```

Replace the pending-invites `<li>`:

```tsx
              <li
                key={invite.id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 px-3.5 py-2.5"
              >
                <span className="font-sans text-sm text-neutral-900">{invite.email}</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => copyInviteLink(invite)}
                    className="font-sans text-sm text-primary-500 hover:underline"
                  >
                    {copiedInviteId === invite.id ? "Copied" : "Copy link"}
                  </button>
                  <button
                    type="button"
                    disabled={resendingId === invite.id}
                    onClick={() => resendInvite(invite.id)}
                    className="font-sans text-sm text-primary-500 hover:underline disabled:opacity-50"
                  >
                    {resendingId === invite.id ? "Resending…" : "Resend"}
                  </button>
                  <button
                    type="button"
                    onClick={() => revokeInvite(invite.id)}
                    className="font-sans text-sm text-error hover:underline"
                  >
                    Revoke
                  </button>
                </div>
              </li>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/business/TeamSection.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit` (from `client/`)
Expected: no output

- [ ] **Step 6: Commit**

```bash
git add client/src/components/business/TeamSection.tsx client/src/components/business/TeamSection.test.tsx
git commit -m "let owners copy or resend a pending invite's link"
```

---

## Task 11: Activity labels and the `/activity` page

**Files:**
- Create: `client/src/lib/activityLabels.ts`
- Test: `client/src/lib/activityLabels.test.ts`
- Create: `client/src/pages/Activity.tsx`
- Test: `client/src/pages/Activity.test.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/Sidebar.tsx`
- Modify: `client/src/components/Sidebar.test.tsx`

- [ ] **Step 1: Write the failing labels test**

Create `client/src/lib/activityLabels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeActivity } from "./activityLabels";

describe("describeActivity", () => {
  it("describes a created document by type", () => {
    expect(describeActivity("DOCUMENT_CREATED", { type: "INVOICE" })).toBe("created an invoice");
  });

  it("describes a finalized document by number when available", () => {
    expect(describeActivity("DOCUMENT_FINALIZED", { type: "INVOICE", number: "INV-0004" })).toBe("finalized INV-0004");
  });

  it("describes a created customer by name", () => {
    expect(describeActivity("CUSTOMER_CREATED", { name: "Acme Ltd" })).toBe("added customer Acme Ltd");
  });

  it("describes an invite by email", () => {
    expect(describeActivity("MEMBER_INVITED", { email: "friend@example.com" })).toBe("invited friend@example.com");
  });

  it("falls back gracefully when metadata is missing", () => {
    expect(describeActivity("MEMBER_JOINED", null)).toBe("joined the team");
  });

  it("falls back to the raw action for an unrecognized action", () => {
    expect(describeActivity("SOMETHING_NEW", null)).toBe("SOMETHING_NEW");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/activityLabels.test.ts` (from `client/`)
Expected: FAIL — `Cannot find module './activityLabels'`

- [ ] **Step 3: Implement the labels module**

Create `client/src/lib/activityLabels.ts`:

```ts
const DOCUMENT_TYPE_DISPLAY: Record<string, string> = {
  INVOICE: "an invoice",
  PROFORMA: "a proforma invoice",
  DELIVERY_NOTE: "a delivery note",
  QUOTE: "a quote",
  RECEIPT: "a receipt",
};

export function describeActivity(action: string, metadata: Record<string, unknown> | null): string {
  const type = typeof metadata?.type === "string" ? metadata.type : undefined;
  const number = typeof metadata?.number === "string" ? metadata.number : undefined;
  const name = typeof metadata?.name === "string" ? metadata.name : undefined;
  const email = typeof metadata?.email === "string" ? metadata.email : undefined;
  const typeLabel = type ? (DOCUMENT_TYPE_DISPLAY[type] ?? "a document") : "a document";

  switch (action) {
    case "DOCUMENT_CREATED":
      return `created ${typeLabel}`;
    case "DOCUMENT_FINALIZED":
      return `finalized ${number ?? typeLabel}`;
    case "DOCUMENT_DELETED":
      return `deleted ${typeLabel}`;
    case "CUSTOMER_CREATED":
      return name ? `added customer ${name}` : "added a customer";
    case "CUSTOMER_DEACTIVATED":
      return name ? `deactivated customer ${name}` : "deactivated a customer";
    case "MEMBER_INVITED":
      return email ? `invited ${email}` : "invited a team member";
    case "MEMBER_JOINED":
      return "joined the team";
    case "MEMBER_REMOVED":
      return email ? `removed ${email}` : "removed a team member";
    default:
      return action;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/activityLabels.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Write the failing Activity page test**

Create `client/src/pages/Activity.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Activity from "./Activity";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Activity />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Activity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows team activity entries", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "owner@example.com" }, business: { id: "b1", name: "Kigali Traders" } }),
          { status: 200 },
        );
      }
      if (url.includes("/business/activity")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "a1",
                action: "CUSTOMER_CREATED",
                entityType: "Customer",
                entityId: "c1",
                metadata: { name: "Acme Ltd" },
                createdAt: "2026-08-25T10:00:00.000Z",
                actor: { id: "u1", email: "owner@example.com" },
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

    renderPage();

    expect(await screen.findByText(/added customer Acme Ltd/i)).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
  });

  it("shows an empty state when there is no activity", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.includes("/business/activity")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    expect(await screen.findByText(/no activity yet/i)).toBeInTheDocument();
  });

  it("switches to the my-activity filter and refetches with actorUserId", async () => {
    let lastUrl = "";
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      lastUrl = url;
      if (url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "owner@example.com" }, business: { id: "b1", name: "Kigali Traders" } }),
          { status: 200 },
        );
      }
      if (url.includes("/business/activity")) {
        return new Response(JSON.stringify({ results: [], total: 0, page: 1, pageSize: 20 }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/no activity yet/i);

    await user.click(screen.getByRole("button", { name: /my activity/i }));

    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(lastUrl).toContain("actorUserId=u1");
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/pages/Activity.test.tsx` (from `client/`)
Expected: FAIL — `Cannot find module './Activity'`

- [ ] **Step 7: Implement the page**

Create `client/src/pages/Activity.tsx`:

```tsx
import { useState } from "react";
import { AppLayout } from "../components/AppLayout";
import { useAuth } from "../context/AuthContext";
import { usePaginatedList } from "../lib/usePaginatedList";
import { describeActivity } from "../lib/activityLabels";

interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; email: string };
}

type SortBy = "createdAt";

export default function Activity() {
  const { user } = useAuth();
  const [showMineOnly, setShowMineOnly] = useState(false);
  const list = usePaginatedList<ActivityEntry, SortBy>({
    resourcePath: "/business/activity",
    defaultSortBy: "createdAt",
    extraParams: showMineOnly && user ? { actorUserId: user.id } : undefined,
  });

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold text-neutral-900">Activity</h1>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowMineOnly(false)}
            className={`rounded-lg px-4 py-2 font-sans text-sm font-medium ${
              !showMineOnly ? "bg-primary-100 text-primary-700" : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            Team activity
          </button>
          <button
            type="button"
            onClick={() => setShowMineOnly(true)}
            className={`rounded-lg px-4 py-2 font-sans text-sm font-medium ${
              showMineOnly ? "bg-primary-100 text-primary-700" : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            My activity
          </button>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-surface p-6">
          {list.error && (
            <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
              {list.error}
            </div>
          )}

          {list.isLoading ? (
            <div className="flex flex-col gap-2" aria-label="Loading activity">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          ) : list.results.length === 0 ? (
            <p className="font-sans text-sm text-neutral-600">
              {showMineOnly ? "You haven't done anything yet." : "No activity yet."}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-neutral-100">
              {list.results.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between py-3 font-sans text-sm">
                  <span className="text-neutral-900">
                    <span className="font-medium">{entry.actor.email}</span>{" "}
                    {describeActivity(entry.action, entry.metadata)}
                  </span>
                  <span className="text-neutral-400">{new Date(entry.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}

          {!list.isLoading && list.results.length > 0 && (
            <div className="mt-4 flex items-center justify-between font-sans text-sm text-neutral-600">
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
      </div>
    </AppLayout>
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/pages/Activity.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 9: Wire up the route**

In `client/src/App.tsx`, add the lazy import after `AcceptInvite`:

```ts
const Activity = lazy(() => import("./pages/Activity"));
```

Add the route inside the `<Route element={<ProtectedRoute />}>` block, after `/dashboard`:

```tsx
                <Route path="/activity" element={<Activity />} />
```

- [ ] **Step 10: Add the sidebar nav link**

In `client/src/components/Sidebar.tsx`, add this icon function after `ItemsIcon`:

```tsx
function ActivityIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l3 8 4-16 3 8h4" />
    </svg>
  );
}
```

In the middle nav group (Customers/Items), add the Activity link after Items:

```tsx
        <div className="mt-4 flex flex-col gap-1">
          <SidebarLink to="/customers" isActive={pathname === "/customers"} onNavigate={onNavigate} icon={<CustomersIcon />}>
            Customers
          </SidebarLink>
          <SidebarLink to="/items" isActive={pathname === "/items"} onNavigate={onNavigate} icon={<ItemsIcon />}>
            Items
          </SidebarLink>
          <SidebarLink to="/activity" isActive={pathname === "/activity"} onNavigate={onNavigate} icon={<ActivityIcon />}>
            Activity
          </SidebarLink>
        </div>
```

- [ ] **Step 11: Update the sidebar test**

In `client/src/components/Sidebar.test.tsx`, add this assertion to the `"shows every nav link"` test, after the `"Items"` assertion:

```ts
    expect(screen.getByRole("link", { name: "Activity" })).toBeInTheDocument();
```

- [ ] **Step 12: Run the affected client tests**

Run: `npx vitest run src/pages/Activity.test.tsx src/lib/activityLabels.test.ts src/components/Sidebar.test.tsx` (from `client/`)
Expected: PASS (all)

- [ ] **Step 13: Typecheck**

Run: `npx tsc --noEmit` (from `client/`)
Expected: no output

- [ ] **Step 14: Commit**

```bash
git add client/src/lib/activityLabels.ts client/src/lib/activityLabels.test.ts client/src/pages/Activity.tsx client/src/pages/Activity.test.tsx client/src/App.tsx client/src/components/Sidebar.tsx client/src/components/Sidebar.test.tsx
git commit -m "add team activity feed page"
```

---

## Task 12: Full-suite verification and live check

**Files:** none (verification only)

- [ ] **Step 1: Typecheck all three workspaces**

Run from `server/`, `client/`, and `shared/` respectively:

```bash
npx tsc --noEmit
```

Expected: no output in all three.

- [ ] **Step 2: Run the full server test suite**

Run (from `server/`): `npx vitest run`
Expected: all tests pass, including every new file from Tasks 1–8.

- [ ] **Step 3: Run the full client test suite**

Run (from `client/`): `npx vitest run`
Expected: all tests pass, including every new file from Tasks 9–11.

- [ ] **Step 4: Run the full shared test suite**

Run (from `shared/`): `npx vitest run`
Expected: all tests pass, including `activity-schemas.test.ts`.

- [ ] **Step 5: Live-verify in the browser**

Restart the dev server process (schema/route changes require a restart — established pattern this session: kill the process listening on port 4000, relaunch with `node --require .../tsx/dist/preflight.cjs --import file:///.../tsx/dist/loader.mjs src/index.ts`).

Walk through: as the owner, create a customer and an invoice, finalize the invoice, visit `/activity` and confirm both entries appear with readable labels. Invite a second account, accept it as that account, confirm the "invited"/"joined" entries appear and are visible to the member too. Remove the member as the owner, confirm their existing session's refresh token no longer works (a subsequent `/auth/refresh` from their cookies 401s). From the Team section, click "Copy link" and "Resend" on a fresh pending invite and confirm both work.

- [ ] **Step 6: Push and verify CI**

```bash
git push
```

Then check `gh run list --limit 1` until the run for the last commit shows `completed success`.
