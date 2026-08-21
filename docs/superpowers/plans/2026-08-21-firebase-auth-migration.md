# Firebase Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled email/password auth with Firebase Auth (Google + email/password) for credentials, while keeping the existing access/refresh cookie session layer completely unchanged for everything after login.

**Architecture:** The client authenticates with Firebase directly (Google popup or email/password), then sends the resulting Firebase ID token once to a new `POST /auth/session` endpoint. The server verifies that token via the Firebase Admin SDK, resolves it to a `User`/`Business`, and issues our own existing session cookies exactly as today. `requireAuth` and every downstream route are untouched. No real users exist yet, so this is a clean cutover: `passwordHash` and bcrypt are removed outright.

**Tech Stack:** Firebase (client SDK `firebase`, server SDK `firebase-admin`) added to the existing Express/Prisma/React stack. No other new dependencies.

Reference: `docs/superpowers/specs/2026-08-21-firebase-auth-migration-design.md`

---

### Task 1: Replace `registerSchema`/`loginSchema` with `sessionSchema`

**Files:**
- Modify: `shared/src/auth-schemas.ts`
- Modify: `shared/src/auth-schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `shared/src/auth-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PASSWORD_REQUIREMENTS, sessionSchema } from "./auth-schemas.js";

describe("sessionSchema", () => {
  it("accepts an idToken with no businessName", () => {
    expect(sessionSchema.safeParse({ idToken: "token123" }).success).toBe(true);
  });

  it("accepts an idToken with a businessName", () => {
    expect(sessionSchema.safeParse({ idToken: "token123", businessName: "Kigali Traders" }).success).toBe(true);
  });

  it("rejects a missing idToken", () => {
    expect(sessionSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an empty idToken", () => {
    expect(sessionSchema.safeParse({ idToken: "" }).success).toBe(false);
  });
});

describe("PASSWORD_REQUIREMENTS", () => {
  const STRONG_PASSWORD = "Supersecret1!";

  it("every requirement is met by a strong password", () => {
    for (const requirement of PASSWORD_REQUIREMENTS) {
      expect(requirement.test(STRONG_PASSWORD)).toBe(true);
    }
  });

  it("an empty string fails every requirement", () => {
    for (const requirement of PASSWORD_REQUIREMENTS) {
      expect(requirement.test("")).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd shared && npx vitest run src/auth-schemas.test.ts`
Expected: FAIL to even compile/run, since `sessionSchema` doesn't exist yet (`registerSchema`/`loginSchema` are still the only exports).

- [ ] **Step 3: Write the implementation**

Replace the full contents of `shared/src/auth-schemas.ts`:

```ts
import { z } from "zod";

const LOWERCASE_RE = /[a-z]/;
const UPPERCASE_RE = /[A-Z]/;
const NUMBER_RE = /[0-9]/;
const SPECIAL_RE = /[^A-Za-z0-9]/;

export const PASSWORD_REQUIREMENTS = [
  { label: "At least 8 characters", test: (value: string) => value.length >= 8 },
  { label: "One lowercase letter", test: (value: string) => LOWERCASE_RE.test(value) },
  { label: "One uppercase letter", test: (value: string) => UPPERCASE_RE.test(value) },
  { label: "One number", test: (value: string) => NUMBER_RE.test(value) },
  { label: "One special character", test: (value: string) => SPECIAL_RE.test(value) },
] as const;

export const sessionSchema = z.object({
  idToken: z.string().trim().min(1, "Missing ID token"),
  businessName: z.string().trim().min(1).optional(),
});
export type SessionInput = z.infer<typeof sessionSchema>;
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd shared && npx vitest run src/auth-schemas.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Run the full shared suite and typecheck**

Run: `cd shared && npm test && npm run typecheck`
Expected: FAIL at this point — `document-schemas.ts` and others don't reference auth-schemas, but nothing else in `shared` should be affected. If it passes cleanly, continue; if something else references `registerSchema`/`loginSchema` within `shared` itself, fix it before moving on.

- [ ] **Step 6: Commit**

```bash
git add shared/src/auth-schemas.ts shared/src/auth-schemas.test.ts
git commit -m "replace registerSchema and loginSchema with a single sessionSchema"
```

---

### Task 2: Schema change — `firebaseUid` replaces `passwordHash`

**Files:**
- Modify: `server/prisma/schema.prisma`
- Delete: `server/src/lib/password.ts`
- Delete: `server/src/lib/password.test.ts`
- Modify: `server/package.json`

- [ ] **Step 1: Update the schema**

In `server/prisma/schema.prisma`, replace the `User` model:

```prisma
model User {
  id           String   @id @default(cuid())
  businessId   String
  email        String   @unique
  passwordHash String
  name         String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  business      Business       @relation(fields: [businessId], references: [id])
  refreshTokens RefreshToken[]

  @@index([businessId])
}
```

with:

```prisma
model User {
  id          String   @id @default(cuid())
  businessId  String
  email       String   @unique
  firebaseUid String   @unique
  name        String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  business      Business       @relation(fields: [businessId], references: [id])
  refreshTokens RefreshToken[]

  @@index([businessId])
}
```

- [ ] **Step 2: Delete the bcrypt password helper and its test**

Delete `server/src/lib/password.ts` and `server/src/lib/password.test.ts`. Remove `bcrypt` and `@types/bcrypt` from `server/package.json`'s `dependencies` and `devDependencies`.

- [ ] **Step 3: Reset the local dev database, then apply the migration**

There are no real users yet, so rather than write a data-preserving migration, reset first:

Run: `cd server && npx prisma migrate reset --force`
Expected: drops and recreates the local dev database from existing migrations, with no data (this is a local-only dev database, safe to wipe).

Run: `cd server && npx prisma migrate dev --name firebase_auth`
Expected: generates and applies a new migration dropping `passwordHash` and adding a required, unique `firebaseUid` column. Since the table is empty, this runs without any data-loss confirmation prompt.

- [ ] **Step 4: Run the full server suite and typecheck**

Run: `cd server && npm install && npm test && npm run typecheck`
Expected: many failures right now (every route still imports `password.ts`, `registerSchema`, `loginSchema`, none of which exist anymore). This is expected. Do not fix these yet; they're addressed in Tasks 3 and 4.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations server/package.json server/package-lock.json
git commit -m "replace passwordHash with firebaseUid on User"
```

(If `package-lock.json` wasn't touched by the `bcrypt` removal, omit it from the add.)

---

### Task 3: Firebase Admin SDK wrapper

**Files:**
- Create: `server/src/lib/firebase-admin.ts`
- Modify: `server/package.json`

This is a thin wrapper around the Firebase Admin SDK. It has no dedicated unit test, the same way `server/src/lib/prisma.ts` (a thin Prisma client singleton) has none: its only logic is initialization and a pass-through call, and it's exercised indirectly through the mocked `POST /auth/session` tests in Task 4.

- [ ] **Step 1: Install the dependency**

Run: `cd server && npm install firebase-admin`

- [ ] **Step 2: Write the wrapper**

Create `server/src/lib/firebase-admin.ts`:

```ts
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function ensureApp() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
}

export async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; email: string }> {
  ensureApp();
  const decoded = await getAuth().verifyIdToken(idToken);
  if (!decoded.email) {
    throw new Error("Firebase token has no email");
  }
  return { uid: decoded.uid, email: decoded.email };
}
```

- [ ] **Step 3: Typecheck**

Run: `cd server && npm run typecheck`
Expected: still fails elsewhere (routes not updated yet), but no new errors from this file itself.

- [ ] **Step 4: Commit**

```bash
git add server/src/lib/firebase-admin.ts server/package.json server/package-lock.json
git commit -m "add a Firebase Admin SDK wrapper for verifying ID tokens"
```

---

### Task 4: `POST /auth/session` replaces `/register` and `/login`

**Files:**
- Modify: `server/src/test/setup.ts`
- Modify: `server/src/routes/auth.ts`
- Delete: `server/src/routes/auth.register.test.ts`
- Delete: `server/src/routes/auth.login.test.ts`
- Create: `server/src/routes/auth.session.test.ts`
- Modify: `server/src/routes/auth.me.test.ts`
- Modify: `server/src/routes/auth.refresh.test.ts`
- Modify: `server/src/routes/auth.logout.test.ts`

- [ ] **Step 1: Add the global test mock for Firebase token verification**

Replace the full contents of `server/src/test/setup.ts`:

```ts
import { config } from "dotenv";
import { vi } from "vitest";

config({ path: ".env.test" });

vi.mock("../lib/firebase-admin.js", () => ({
  verifyFirebaseToken: async (idToken: string) => JSON.parse(idToken),
}));
```

This makes every server test's `verifyFirebaseToken` call decode a JSON string instead of calling real Firebase. A test's "ID token" is just `JSON.stringify({ uid, email })`.

- [ ] **Step 2: Write the failing tests**

Delete `server/src/routes/auth.register.test.ts` and `server/src/routes/auth.login.test.ts` (their endpoints no longer exist).

Create `server/src/routes/auth.session.test.ts`:

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

function fakeIdToken(uid: string, email: string): string {
  return JSON.stringify({ uid, email });
}

describe("POST /auth/session", () => {
  it("creates a business and user on first sign-in with a businessName", async () => {
    const res = await request(createApp()).post("/auth/session").send({
      idToken: fakeIdToken("uid-1", "owner@example.com"),
      businessName: "Kigali Traders",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("owner@example.com");
    expect(res.body.business.name).toBe("Kigali Traders");

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("access_token="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("refresh_token="))).toBe(true);

    const user = await prisma.user.findUnique({ where: { firebaseUid: "uid-1" } });
    expect(user).not.toBeNull();
  });

  it("signs in an existing user on a repeat call with the same uid, without creating a duplicate", async () => {
    const app = createApp();
    await request(app).post("/auth/session").send({
      idToken: fakeIdToken("uid-1", "owner@example.com"),
      businessName: "Kigali Traders",
    });

    const res = await request(app).post("/auth/session").send({
      idToken: fakeIdToken("uid-1", "owner@example.com"),
    });

    expect(res.status).toBe(200);
    expect(res.body.business.name).toBe("Kigali Traders");

    const users = await prisma.user.findMany({ where: { firebaseUid: "uid-1" } });
    expect(users).toHaveLength(1);
  });

  it("returns 404 no_account for an unknown uid with no businessName", async () => {
    const res = await request(createApp()).post("/auth/session").send({
      idToken: fakeIdToken("uid-1", "owner@example.com"),
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("no_account");
  });

  it("returns 401 for an invalid token", async () => {
    const res = await request(createApp()).post("/auth/session").send({
      idToken: "not-json",
      businessName: "Kigali Traders",
    });

    expect(res.status).toBe(401);
  });

  it("rejects an invalid body with 400", async () => {
    const res = await request(createApp()).post("/auth/session").send({ businessName: "Kigali Traders" });
    expect(res.status).toBe(400);
  });
});
```

In `server/src/routes/auth.me.test.ts`, replace the register call inside the first test:

```ts
    const registerRes = await request(app).post("/auth/register").send({
      email: "owner@example.com",
      password: "Supersecret1!",
      businessName: "Kigali Traders",
    });
```

with:

```ts
    const registerRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
      businessName: "Kigali Traders",
    });
```

In `server/src/routes/auth.refresh.test.ts`, replace the register call inside `registerAndGetRefreshCookie`:

```ts
  const res = await request(app).post("/auth/register").send({
    email: "owner@example.com",
    password: "Supersecret1!",
    businessName: "Kigali Traders",
  });
```

with:

```ts
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
```

In `server/src/routes/auth.logout.test.ts`, replace the register call inside the first test:

```ts
    const registerRes = await request(app).post("/auth/register").send({
      email: "owner@example.com",
      password: "Supersecret1!",
      businessName: "Kigali Traders",
    });
```

with:

```ts
    const registerRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
      businessName: "Kigali Traders",
    });
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `cd server && npx vitest run src/routes/auth.session.test.ts src/routes/auth.me.test.ts src/routes/auth.refresh.test.ts src/routes/auth.logout.test.ts`
Expected: FAIL, the `/auth/session` route doesn't exist yet.

- [ ] **Step 4: Write the implementation**

Replace the full contents of `server/src/routes/auth.ts`:

```ts
import crypto from "node:crypto";
import { Router } from "express";
import { sessionSchema } from "@billa/shared";
import type { SessionInput } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { verifyFirebaseToken } from "../lib/firebase-admin.js";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "../lib/tokens.js";
import { ttlToMs } from "../lib/ttl.js";
import { clearAuthCookies, setAccessTokenCookie, setRefreshTokenCookie } from "../lib/cookies.js";
import { validateBody } from "../middleware/validate.js";
import { authRateLimit } from "../middleware/auth-rate-limit.js";
import { requireAuth } from "../middleware/require-auth.js";

export const authRouter = Router();

function refreshTtlMs(): number {
  return ttlToMs(process.env.JWT_REFRESH_TTL ?? "30d");
}

async function issueSession(res: Parameters<typeof setAccessTokenCookie>[0], userId: string, businessId: string) {
  const accessToken = signAccessToken({ userId, businessId });
  const refreshToken = generateRefreshToken();
  const ttlMs = refreshTtlMs();

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      family: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });

  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, refreshToken, ttlMs);
}

authRouter.post("/session", authRateLimit, validateBody(sessionSchema), async (req, res) => {
  const { idToken, businessName } = req.body as SessionInput;

  let firebaseUser: { uid: string; email: string };
  try {
    firebaseUser = await verifyFirebaseToken(idToken);
  } catch {
    res.status(401).json({ error: "invalid_token" });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { firebaseUid: firebaseUser.uid } });
  if (existing) {
    const business = await prisma.business.findUnique({ where: { id: existing.businessId } });
    await issueSession(res, existing.id, existing.businessId);
    res.json({
      user: { id: existing.id, email: existing.email },
      business: { id: business!.id, name: business!.name },
    });
    return;
  }

  if (!businessName) {
    res.status(404).json({ error: "no_account" });
    return;
  }

  const { user, business } = await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({ data: { name: businessName } });
    const user = await tx.user.create({
      data: { email: firebaseUser.email, firebaseUid: firebaseUser.uid, businessId: business.id },
    });
    return { user, business };
  });

  await issueSession(res, user.id, business.id);
  res.status(201).json({
    user: { id: user.id, email: user.email },
    business: { id: business.id, name: business.name },
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    include: { business: true },
  });
  if (!user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  res.json({
    user: { id: user.id, email: user.email },
    business: { id: user.business.id, name: user.business.name },
  });
});

authRouter.post("/refresh", async (req, res) => {
  const presented = req.cookies?.refresh_token;
  if (!presented) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const presentedHash = hashRefreshToken(presented);
  const stored = await prisma.refreshToken.findFirst({ where: { tokenHash: presentedHash } });

  if (!stored) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { family: stored.family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    res.status(401).json({ error: "token_reuse_detected" });
    return;
  }

  if (stored.expiresAt < new Date()) {
    res.status(401).json({ error: "expired" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const accessToken = signAccessToken({ userId: user.id, businessId: user.businessId });
  const newRefreshToken = generateRefreshToken();
  const ttlMs = refreshTtlMs();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(newRefreshToken),
      family: stored.family,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });

  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, newRefreshToken, ttlMs);
  res.json({ ok: true });
});

authRouter.post("/logout", async (req, res) => {
  const presented = req.cookies?.refresh_token;
  if (presented) {
    const presentedHash = hashRefreshToken(presented);
    await prisma.refreshToken.updateMany({
      where: { tokenHash: presentedHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  clearAuthCookies(res);
  res.json({ ok: true });
});
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `cd server && npx vitest run src/routes/auth.session.test.ts src/routes/auth.me.test.ts src/routes/auth.refresh.test.ts src/routes/auth.logout.test.ts`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add server/src/test/setup.ts server/src/routes/auth.ts server/src/routes/auth.session.test.ts server/src/routes/auth.me.test.ts server/src/routes/auth.refresh.test.ts server/src/routes/auth.logout.test.ts
git rm server/src/routes/auth.register.test.ts server/src/routes/auth.login.test.ts
git commit -m "replace register and login endpoints with a single Firebase-token session endpoint"
```

---

### Task 5: Update every other test file's session-setup helper

**Files (all 22, each has a `registerAndGetCookies`-style helper calling `/auth/register`):**
- `server/src/routes/documents.list.test.ts`
- `server/src/routes/documents.convert.test.ts`
- `server/src/routes/documents.pdf.test.ts`
- `server/src/routes/documents.delete.test.ts`
- `server/src/routes/documents.finalize.test.ts`
- `server/src/routes/documents.patch.test.ts`
- `server/src/routes/documents.get.test.ts`
- `server/src/routes/documents.create.test.ts`
- `server/src/routes/items.patch.test.ts`
- `server/src/routes/items.create.test.ts`
- `server/src/routes/items.list.test.ts`
- `server/src/routes/customers.patch.test.ts`
- `server/src/routes/customers.create.test.ts`
- `server/src/routes/customers.list.test.ts`
- `server/src/routes/business.confirm-logo.test.ts`
- `server/src/routes/business.extract-colors.test.ts`
- `server/src/routes/business.remove-background.test.ts`
- `server/src/routes/business.logo.test.ts`
- `server/src/routes/business.sequences.put.test.ts`
- `server/src/routes/business.sequences.get.test.ts`
- `server/src/routes/business.patch.test.ts`
- `server/src/routes/business.get.test.ts`

Every occurrence across these 22 files follows the exact same shape (confirmed by grep before writing this plan):

```ts
.post("/auth/register").send({
  email: "<EMAIL>",
  password: "<PASSWORD>",
  businessName: "<BUSINESS_NAME>",
})
```

(Some files have this twice: once for the main test business, once more for a second "other business" in a tenant-isolation test, e.g. `email: "other@example.com"`.) The transformation is identical everywhere: drop `password`, replace `/auth/register` with `/auth/session`, and wrap `email` into a JSON `idToken` that also carries it as the fake `uid`:

```ts
.post("/auth/session").send({
  idToken: JSON.stringify({ uid: "<EMAIL>", email: "<EMAIL>" }),
  businessName: "<BUSINESS_NAME>",
})
```

- [ ] **Step 1: Run the scripted replacement**

This is a purely mechanical, uniform transformation applied identically across all 22 files, so apply it with a script rather than by hand, to avoid the risk of a typo in one of 24 repetitions. From the repo root:

```bash
node -e '
const fs = require("fs");
const files = [
  "server/src/routes/documents.list.test.ts",
  "server/src/routes/documents.convert.test.ts",
  "server/src/routes/documents.pdf.test.ts",
  "server/src/routes/documents.delete.test.ts",
  "server/src/routes/documents.finalize.test.ts",
  "server/src/routes/documents.patch.test.ts",
  "server/src/routes/documents.get.test.ts",
  "server/src/routes/documents.create.test.ts",
  "server/src/routes/items.patch.test.ts",
  "server/src/routes/items.create.test.ts",
  "server/src/routes/items.list.test.ts",
  "server/src/routes/customers.patch.test.ts",
  "server/src/routes/customers.create.test.ts",
  "server/src/routes/customers.list.test.ts",
  "server/src/routes/business.confirm-logo.test.ts",
  "server/src/routes/business.extract-colors.test.ts",
  "server/src/routes/business.remove-background.test.ts",
  "server/src/routes/business.logo.test.ts",
  "server/src/routes/business.sequences.put.test.ts",
  "server/src/routes/business.sequences.get.test.ts",
  "server/src/routes/business.patch.test.ts",
  "server/src/routes/business.get.test.ts",
];
const pattern = /\.post\("\/auth\/register"\)\.send\(\{\s*email:\s*"([^"]+)",\s*password:\s*"[^"]+",\s*businessName:\s*"([^"]*)",?\s*\}\)/g;
for (const file of files) {
  const original = fs.readFileSync(file, "utf8");
  let count = 0;
  const updated = original.replace(pattern, (match, email, businessName) => {
    count += 1;
    return `.post("/auth/session").send({\n      idToken: JSON.stringify({ uid: "${email}", email: "${email}" }),\n      businessName: "${businessName}",\n    })`;
  });
  if (count === 0) {
    throw new Error("no match found in " + file);
  }
  fs.writeFileSync(file, updated);
  console.log(file + ": " + count + " replacement(s)");
}
'
```

Expected output: one line per file, each showing 1 or 2 replacements (2 for the files with a second "other business" registration), 22 lines total, no error thrown.

- [ ] **Step 2: Run the full server suite**

Run: `cd server && npm test`
Expected: PASS, all tests across all 55 test files.

- [ ] **Step 3: Typecheck**

Run: `cd server && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Spot-check the diff**

Run: `git diff --stat server/src/routes` and skim two or three of the changed files to confirm the replacement landed cleanly (correct indentation, no stray braces). Fix by hand if the script produced anything malformed in a specific file, then re-run that file's tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes
git commit -m "update all server test session-setup helpers to authenticate via the new session endpoint"
```

---

### Task 6: Client Firebase SDK wrapper

**Files:**
- Modify: `client/package.json`
- Create: `client/src/lib/firebase.ts`
- Create: `client/src/lib/firebaseAuth.ts`
- Modify: `client/.env.example`

No dedicated unit test for these two files: `firebase.ts` only does SDK initialization (no logic to assert on), and `firebaseAuth.ts`'s thin wrapper functions are exercised indirectly through the mocked `Login.test.tsx`/`Register.test.tsx` tests in Tasks 8 and 9, the same way `apiClient.ts`'s internals aren't unit-tested directly.

- [ ] **Step 1: Install the dependency**

Run: `cd client && npm install firebase`

- [ ] **Step 2: Write the Firebase app/auth instance**

Create `client/src/lib/firebase.ts`:

```ts
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "test-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "test-project.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "test-project",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "1:000000000000:web:0000000000000000000000",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
```

The fallback values keep this module safe to import in tests and in local dev before a real Firebase project is wired in (`initializeApp`/`getAuth` don't make network calls; only an actual sign-in attempt would fail against fake values). Real values go in `client/.env` (not committed), overriding these fallbacks.

- [ ] **Step 3: Write the action wrappers**

Create `client/src/lib/firebaseAuth.ts`:

```ts
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";

export async function signInWithEmail(email: string, password: string): Promise<string> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user.getIdToken();
}

export async function signUpWithEmail(email: string, password: string): Promise<string> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  return credential.user.getIdToken();
}

export async function signInWithGoogle(): Promise<string> {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user.getIdToken();
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export function firebaseErrorCode(err: unknown): string | null {
  if (typeof err === "object" && err !== null && "code" in err) {
    return String((err as { code: unknown }).code);
  }
  return null;
}
```

- [ ] **Step 4: Add the env var placeholders**

Append to `client/.env.example`:

```
VITE_FIREBASE_API_KEY="your-firebase-api-key"
VITE_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_APP_ID="your-firebase-app-id"
```

- [ ] **Step 5: Typecheck**

Run: `cd client && npm run typecheck`
Expected: still fails elsewhere (AuthContext/Login/Register not updated yet), but no new errors from these two new files.

- [ ] **Step 6: Commit**

```bash
git add client/package.json client/package-lock.json client/src/lib/firebase.ts client/src/lib/firebaseAuth.ts client/.env.example
git commit -m "add a Firebase client SDK wrapper for sign-in, sign-up, and password reset"
```

---

### Task 7: `AuthContext` and `apiClient` updates

**Files:**
- Modify: `client/src/context/AuthContext.tsx`
- Modify: `client/src/lib/apiClient.ts`

- [ ] **Step 1: Update `apiClient.ts`'s no-refresh-retry path check**

`apiRequest` special-cases the login path so a failed login attempt doesn't trigger a refresh-then-retry loop. That path is renamed from `/auth/login` to `/auth/session`:

```ts
  if (response.status === 401 && path !== "/auth/login" && path !== "/auth/refresh") {
```

becomes:

```ts
  if (response.status === 401 && path !== "/auth/session" && path !== "/auth/refresh") {
```

- [ ] **Step 2: Rewrite `AuthContext.tsx`**

Replace the full contents of `client/src/context/AuthContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRequest } from "../lib/apiClient";
import {
  resetPassword as resetPasswordFirebase,
  signInWithEmail,
  signInWithGoogle as signInWithGoogleFirebase,
  signOutFirebase,
  signUpWithEmail,
} from "../lib/firebaseAuth";

interface User {
  id: string;
  email: string;
}

interface Business {
  id: string;
  name: string;
}

interface AuthContextValue {
  user: User | null;
  business: Business | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, businessName: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  registerWithGoogle: (businessName: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function exchangeSession(idToken: string, businessName?: string) {
  return apiRequest<{ user: User; business: Business }>("/auth/session", {
    method: "POST",
    body: businessName ? { idToken, businessName } : { idToken },
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ user: User; business: Business }>("/auth/me")
      .then((data) => {
        setUser(data.user);
        setBusiness(data.business);
      })
      .catch(() => {
        setUser(null);
        setBusiness(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const idToken = await signInWithEmail(email, password);
    const data = await exchangeSession(idToken);
    setUser(data.user);
    setBusiness(data.business);
  }

  async function register(email: string, password: string, businessName: string) {
    const idToken = await signUpWithEmail(email, password);
    const data = await exchangeSession(idToken, businessName);
    setUser(data.user);
    setBusiness(data.business);
  }

  async function loginWithGoogle() {
    const idToken = await signInWithGoogleFirebase();
    const data = await exchangeSession(idToken);
    setUser(data.user);
    setBusiness(data.business);
  }

  async function registerWithGoogle(businessName: string) {
    const idToken = await signInWithGoogleFirebase();
    const data = await exchangeSession(idToken, businessName);
    setUser(data.user);
    setBusiness(data.business);
  }

  async function resetPassword(email: string) {
    await resetPasswordFirebase(email);
  }

  async function logout() {
    await signOutFirebase();
    await apiRequest("/auth/logout", { method: "POST" });
    setUser(null);
    setBusiness(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, business, isLoading, login, register, loginWithGoogle, registerWithGoogle, resetPassword, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
```

- [ ] **Step 3: Run the existing `AuthContext` test to confirm it still passes**

Run: `cd client && npx vitest run src/context/AuthContext.test.tsx`
Expected: PASS, unchanged (both existing tests only exercise the `/auth/me` bootstrap path, not `login`/`register`, so they're unaffected by this rewrite).

- [ ] **Step 4: Typecheck**

Run: `cd client && npm run typecheck`
Expected: still fails in `Login.tsx`/`Register.tsx` (not updated yet, they still reference the old `loginSchema`/`registerSchema`), but no new errors from `AuthContext.tsx` or `apiClient.ts`.

- [ ] **Step 5: Commit**

```bash
git add client/src/context/AuthContext.tsx client/src/lib/apiClient.ts
git commit -m "route AuthContext's login and register through Firebase and the new session endpoint"
```

---

### Task 8: `Login.tsx` — Google button and password reset

**Files:**
- Modify: `client/src/pages/Login.tsx`
- Modify: `client/src/pages/Login.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `client/src/pages/Login.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Login from "./Login";

vi.mock("../lib/firebaseAuth", () => ({
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutFirebase: vi.fn(),
  resetPassword: vi.fn(),
  firebaseErrorCode: (err: unknown) =>
    typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : null,
}));

import { resetPassword, signInWithEmail, signInWithGoogle } from "../lib/firebaseAuth";

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<div>onboarding page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

describe("Login", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks the email field invalid on an empty submit", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderLogin();

    await user.click(await screen.findByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toHaveAttribute("aria-invalid", "true"));
  });

  it("navigates to /onboarding after a successful login", async () => {
    vi.mocked(signInWithEmail).mockResolvedValue("fake-id-token");
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/auth/session")) {
        return new Response(
          JSON.stringify({
            user: { id: "u1", email: "owner@example.com" },
            business: { id: "b1", name: "Kigali Traders" },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret1");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByText("onboarding page")).toBeInTheDocument());
  });

  it("shows an error banner on invalid credentials", async () => {
    vi.mocked(signInWithEmail).mockRejectedValue({ code: "auth/invalid-credential" });
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/doesn't match our records/i)).toBeInTheDocument();
  });

  it("signs in with Google and navigates to /onboarding", async () => {
    vi.mocked(signInWithGoogle).mockResolvedValue("fake-google-token");
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/auth/session")) {
        return new Response(
          JSON.stringify({
            user: { id: "u1", email: "owner@example.com" },
            business: { id: "b1", name: "Kigali Traders" },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderLogin();

    await user.click(await screen.findByRole("button", { name: /continue with google/i }));

    await waitFor(() => expect(screen.getByText("onboarding page")).toBeInTheDocument());
  });

  it("shows a message after requesting a password reset", async () => {
    vi.mocked(resetPassword).mockResolvedValue(undefined);
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText(/email/i), "owner@example.com");
    await user.click(screen.getByRole("button", { name: /forgot password/i }));

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/Login.test.tsx`
Expected: FAIL — `Login.tsx` still posts credentials directly to `/auth/login` and has no Google button or forgot-password link.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `client/src/pages/Login.tsx`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { FormField } from "../components/FormField";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/apiClient";
import { firebaseErrorCode } from "../lib/firebaseAuth";

const loginFormSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
type LoginFormInput = z.infer<typeof loginFormSchema>;

const INVALID_CREDENTIAL_CODES = new Set(["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"]);

export default function Login() {
  const { login, loginWithGoogle, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormInput>({ resolver: zodResolver(loginFormSchema) });

  async function onSubmit(data: LoginFormInput) {
    setApiError(null);
    setResetMessage(null);
    try {
      await login(data.email, data.password);
      navigate("/onboarding");
    } catch (err) {
      const code = firebaseErrorCode(err);
      if (code && INVALID_CREDENTIAL_CODES.has(code)) {
        setApiError("That email or password doesn't match our records.");
      } else {
        setApiError("Something went wrong. Try again.");
      }
    }
  }

  async function handleGoogle() {
    setApiError(null);
    setResetMessage(null);
    try {
      await loginWithGoogle();
      navigate("/onboarding");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setApiError("No account found for that Google account. Create one instead?");
      } else if (firebaseErrorCode(err) !== "auth/popup-closed-by-user") {
        setApiError("Something went wrong. Try again.");
      }
    }
  }

  async function handleForgotPassword() {
    setApiError(null);
    const email = getValues("email");
    if (!email) {
      setApiError("Enter your email above first.");
      return;
    }
    try {
      await resetPassword(email);
    } catch {
      // Same message either way, so we don't reveal whether the email exists.
    }
    setResetMessage("Check your email for a link to reset your password.");
  }

  return (
    <AuthLayout eyebrow="Welcome back" headline="Back to business." tagline="Pick up where you left off">
      <h2 className="font-display text-2xl font-semibold text-neutral-900">Log in</h2>
      <p className="mt-2 font-sans text-sm text-neutral-600">
        New to Billa?{" "}
        <Link to="/register" className="font-medium text-primary-500 hover:text-primary-700">
          Create an account
        </Link>
      </p>

      <Button
        type="button"
        onClick={handleGoogle}
        className="mt-6 border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50"
      >
        Continue with Google
      </Button>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-5" noValidate>
        {apiError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {apiError}
          </div>
        )}
        {resetMessage && (
          <div className="rounded-lg bg-success-bg px-4 py-3 font-sans text-sm text-success" role="status">
            {resetMessage}
          </div>
        )}
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <button
          type="button"
          onClick={handleForgotPassword}
          className="self-start font-sans text-sm text-primary-500 hover:text-primary-700"
        >
          Forgot password?
        </button>
        <Button type="submit" isLoading={isSubmitting}>
          Log in
        </Button>
      </form>
    </AuthLayout>
  );
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd client && npx vitest run src/pages/Login.test.tsx`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: still fails in `Register.tsx` (not updated yet), but no new failures elsewhere.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Login.tsx client/src/pages/Login.test.tsx
git commit -m "add Google sign-in and password reset to the login page"
```

---

### Task 9: `Register.tsx` — Google button and client-only password validation

**Files:**
- Modify: `client/src/pages/Register.tsx`
- Modify: `client/src/pages/Register.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `client/src/pages/Register.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import Register from "./Register";

vi.mock("../lib/firebaseAuth", () => ({
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutFirebase: vi.fn(),
  resetPassword: vi.fn(),
  firebaseErrorCode: (err: unknown) =>
    typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : null,
}));

import { signInWithGoogle, signUpWithEmail } from "../lib/firebaseAuth";

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={["/register"]}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/onboarding" element={<div>onboarding page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

describe("Register", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks the business name field invalid on an empty submit", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderRegister();

    await user.click(await screen.findByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/business name/i)).toHaveAttribute("aria-invalid", "true"),
    );
  });

  it("navigates to /onboarding after a successful registration", async () => {
    vi.mocked(signUpWithEmail).mockResolvedValue("fake-id-token");
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/auth/session")) {
        return new Response(
          JSON.stringify({
            user: { id: "u1", email: "owner@example.com" },
            business: { id: "b1", name: "Kigali Traders" },
          }),
          { status: 201 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderRegister();

    await user.type(await screen.findByLabelText(/business name/i), "Kigali Traders");
    await user.type(screen.getByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText(/^password/i), "Supersecret1!");
    await user.type(screen.getByLabelText(/confirm password/i), "Supersecret1!");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(screen.getByText("onboarding page")).toBeInTheDocument());
  });

  it("shows an error banner when the email is already taken", async () => {
    vi.mocked(signUpWithEmail).mockRejectedValue({ code: "auth/email-already-in-use" });
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    const user = userEvent.setup();
    renderRegister();

    await user.type(await screen.findByLabelText(/business name/i), "Kigali Traders");
    await user.type(screen.getByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText(/^password/i), "Supersecret1!");
    await user.type(screen.getByLabelText(/confirm password/i), "Supersecret1!");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/already registered/i)).toBeInTheDocument();
  });

  it("shows an error when the confirm password field doesn't match", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderRegister();

    await user.type(await screen.findByLabelText(/business name/i), "Kigali Traders");
    await user.type(screen.getByLabelText(/email/i), "owner@example.com");
    await user.type(await screen.findByLabelText(/^password/i), "Supersecret1!");
    await user.type(screen.getByLabelText(/confirm password/i), "Different1!");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/passwords don.t match/i)).toBeInTheDocument();
  });

  it("shows password requirements as unmet before typing", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    renderRegister();

    const items = await screen.findAllByRole("listitem");
    for (const item of items) {
      expect(item).toHaveClass("text-neutral-400");
    }
  });

  it("shows password requirements as met once a strong password is typed", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderRegister();

    await user.type(await screen.findByLabelText(/^password/i), "Supersecret1!");

    const items = screen.getAllByRole("listitem");
    for (const item of items) {
      expect(item).toHaveClass("text-success");
    }
  });

  it("signs up with Google using the entered business name", async () => {
    vi.mocked(signInWithGoogle).mockResolvedValue("fake-google-token");
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/me")) {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith("/auth/session")) {
        const body = JSON.parse(init?.body as string);
        expect(body.businessName).toBe("Kigali Traders");
        return new Response(
          JSON.stringify({
            user: { id: "u1", email: "owner@example.com" },
            business: { id: "b1", name: "Kigali Traders" },
          }),
          { status: 201 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderRegister();

    await user.type(await screen.findByLabelText(/business name/i), "Kigali Traders");
    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() => expect(screen.getByText("onboarding page")).toBeInTheDocument());
  });

  it("blocks Google sign-up until a business name is entered", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const user = userEvent.setup();
    renderRegister();

    await user.click(await screen.findByRole("button", { name: /continue with google/i }));

    expect(signInWithGoogle).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByLabelText(/business name/i)).toHaveAttribute("aria-invalid", "true"),
    );
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/Register.test.tsx`
Expected: FAIL — `Register.tsx` still imports the removed `registerSchema`, posts directly to `/auth/register`, and has no Google button.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `client/src/pages/Register.tsx`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { PASSWORD_REQUIREMENTS } from "@billa/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { FormField } from "../components/FormField";
import { useAuth } from "../context/AuthContext";
import { firebaseErrorCode } from "../lib/firebaseAuth";

const registerFormSchema = z
  .object({
    businessName: z.string().min(1, "Enter your business name"),
    email: z.string().email("Enter a valid email address"),
    password: z.string().refine((value) => PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(value)), {
      message: "Password doesn't meet the requirements below",
    }),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
type RegisterFormInput = z.infer<typeof registerFormSchema>;

export default function Register() {
  const { register: registerBusiness, registerWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    trigger,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormInput>({ resolver: zodResolver(registerFormSchema) });
  const password = watch("password") ?? "";

  async function onSubmit(data: RegisterFormInput) {
    setApiError(null);
    try {
      await registerBusiness(data.email, data.password, data.businessName);
      navigate("/onboarding");
    } catch (err) {
      if (firebaseErrorCode(err) === "auth/email-already-in-use") {
        setApiError("That email is already registered. Try logging in instead.");
      } else {
        setApiError("Something went wrong. Try again.");
      }
    }
  }

  async function handleGoogle() {
    const valid = await trigger("businessName");
    if (!valid) return;
    setApiError(null);
    try {
      await registerWithGoogle(getValues("businessName"));
      navigate("/onboarding");
    } catch (err) {
      if (firebaseErrorCode(err) !== "auth/popup-closed-by-user") {
        setApiError("Something went wrong. Try again.");
      }
    }
  }

  return (
    <AuthLayout
      eyebrow="Get started"
      headline="Your first professional invoice is minutes away."
      tagline="Add your business details once and every business document after that takes seconds."
    >
      <h2 className="font-display text-2xl font-semibold text-neutral-900">Create your account</h2>
      <p className="mt-2 font-sans text-sm text-neutral-600">
        Already have one?{" "}
        <Link to="/login" className="font-medium text-primary-500 hover:text-primary-700">
          Log in
        </Link>
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-5" noValidate>
        {apiError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {apiError}
          </div>
        )}
        <FormField
          id="businessName"
          label="Business name"
          type="text"
          autoComplete="organization"
          error={errors.businessName?.message}
          {...register("businessName")}
        />
        <Button
          type="button"
          onClick={handleGoogle}
          className="border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50"
        >
          Continue with Google
        </Button>
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <ul className="-mt-2 flex flex-col gap-1">
          {PASSWORD_REQUIREMENTS.map((requirement) => {
            const met = requirement.test(password);
            return (
              <li
                key={requirement.label}
                className={`font-sans text-xs transition-colors ${met ? "text-success" : "text-neutral-400"}`}
              >
                {requirement.label}
              </li>
            );
          })}
        </ul>
        <FormField
          id="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
        <Button type="submit" isLoading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd client && npx vitest run src/pages/Register.test.tsx`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Register.tsx client/src/pages/Register.test.tsx
git commit -m "add Google sign-up to the register page and move password validation client-side"
```

---

### Task 10: Server env var documentation

**Files:**
- Modify: `server/.env.example`

- [ ] **Step 1: Add the Firebase Admin env vars**

Append to `server/.env.example`:

```
# Firebase Admin SDK (Project Settings -> Service Accounts -> Generate new private key)
FIREBASE_PROJECT_ID="your-firebase-project-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"
```

- [ ] **Step 2: Commit**

```bash
git add server/.env.example
git commit -m "document the Firebase Admin env vars needed for the session endpoint"
```

---

### Task 11: Full suite, typecheck, and verification

**Files:** none (verification only)

- [ ] **Step 1: Run every workspace's test suite**

Run: `cd shared && npm test && cd ../server && npm test && cd ../client && npm test`
Expected: all pass.

- [ ] **Step 2: Typecheck every workspace**

Run: `cd shared && npm run typecheck && cd ../server && npm run typecheck && cd ../client && npm run typecheck`
Expected: no errors in any workspace.

- [ ] **Step 3: Set up a real Firebase project**

This step needs you, since it requires your Google account in the Firebase console:

1. Go to the Firebase console and create a new project (any name, e.g. "Billa").
2. Under Authentication -> Sign-in method, enable the **Google** and **Email/Password** providers.
3. Under Project settings -> General -> Your apps, register a Web app and copy its config values into `client/.env` as `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.
4. Under Project settings -> Service accounts, click "Generate new private key" to download a JSON file. From it, copy `project_id` -> `FIREBASE_PROJECT_ID`, `client_email` -> `FIREBASE_CLIENT_EMAIL`, and `private_key` -> `FIREBASE_PRIVATE_KEY` into `server/.env`, keeping the `\n` sequences in the private key exactly as they appear in the JSON.

Without this step, the real-browser verification below can't succeed (registration/login will fail because there's no real Firebase project to authenticate against). If you'd rather defer this, stop here and come back to Step 4 once the project exists.

- [ ] **Step 4: Real-browser verification**

With both dev servers running and the env vars from Step 3 in place:

1. Register a new account with email/password and a business name. Confirm it lands on onboarding and that `GET /auth/me` (via the Network tab) returns the right user/business.
2. Log out, then log back in with the same email/password. Confirm it succeeds.
3. Log out, then click "Continue with Google" on the login page using a Google account that has never signed up. Confirm you see the "No account found" message rather than silently creating a broken account.
4. Go to the register page, fill in a business name, and click "Continue with Google". Confirm it creates a new account tied to that business name.
5. Log out, then use "Forgot password?" on the login page. Confirm a reset email arrives at the address you used (check the inbox of a real test email address, or the Firebase console's own testing tools if you used one).
6. Confirm all the pre-existing document/customer/item workflows still work end-to-end while authenticated via the new flow, since none of that code changed but it's worth confirming the session cookies still carry through correctly.
7. Check the browser's console and network tab for unexpected errors during all of the above.

- [ ] **Step 5: Fix any issues found**

If real-browser verification finds bugs, fix them, add or update the relevant test(s) to cover what was missed, re-run that test file to confirm it passes, then commit the fix as its own commit.

- [ ] **Step 6: Final confirmation**

Once every workspace's suite passes, every workspace typechecks, and manual verification against a real Firebase project found no outstanding issues, this stage is done.

---

## Self-review notes

- **Spec coverage:** the `POST /auth/session` endpoint with all three resolution branches (sign-in, sign-up, no-account) (Task 4), the `firebaseUid` schema change (Task 2), the global test-mocking strategy covering all 27 affected server test files (Tasks 4 and 5), the client Firebase wrapper and its use in `AuthContext`/`Login`/`Register` (Tasks 6-9), Google plus email/password as the two providers, and free password reset via Firebase (Task 8) are all covered.
- **Placeholder scan:** no TBD/TODO; every step shows real code, an exact command, or (for Task 11's Firebase console steps, which are inherently manual and external) an explicit numbered checklist of what to click.
- **Type consistency:** `SessionInput` (Task 1) matches exactly what Task 4's route destructures (`idToken`, `businessName`) and what Task 7's `exchangeSession` sends. `verifyFirebaseToken`'s return shape `{ uid, email }` (Task 3) matches what Task 4's route reads (`firebaseUser.uid`, `firebaseUser.email`) and what the global test mock (Task 4, Step 1) produces by parsing the same JSON shape used everywhere fake tokens are constructed (Tasks 4 and 5). `AuthContextValue`'s new methods (`loginWithGoogle`, `registerWithGoogle`, `resetPassword`) declared in Task 7 are exactly the methods Tasks 8 and 9 destructure from `useAuth()`.
