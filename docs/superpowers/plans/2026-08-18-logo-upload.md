# Logo Upload & Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A validated, storage-backed logo upload endpoint that returns a URL without touching the `Business` record.

**Architecture:** A `LogoStorage` interface with a `LocalDiskStorage` implementation (swap-in point for S3 later), a `detectAllowedImageType` helper that sniffs real file bytes via `file-type` (not just the declared MIME type), and a `POST /business/logo` route on the existing `businessRouter` using `multer` for multipart parsing. Uploaded files are served back via Express static middleware at `/uploads`.

**Tech Stack:** multer (memory storage), file-type, Express static middleware. Everything else (Express, Prisma, vitest, supertest) already in place.

---

### Task 1: Dependencies and test uploads directory

**Files:**
- Modify: `server/package.json`
- Modify: `.gitignore`
- Modify: `server/.env.test.example`
- Modify (local, not committed): `server/.env.test`

- [ ] **Step 1: Add dependencies**

Edit `server/package.json`, add to `"dependencies"`:

```json
"multer": "^2.2.0"
```

Add to `"devDependencies"`:

```json
"@types/multer": "^2.2.0",
"file-type": "^22.0.2"
```

(multer 1.x and file-type <21.4.0 both have known CVEs — use these patched
major versions. `fileTypeFromBuffer`'s API is unchanged between file-type 19
and 22.)

- [ ] **Step 2: Install**

Run: `npm install --workspace=server`

- [ ] **Step 3: Add a gitignored test uploads directory**

Edit `.gitignore`, add under the existing uploads section:

```
server/uploads-test/
```

- [ ] **Step 4: Configure the test env**

Edit `server/.env.test.example`, add:

```
UPLOADS_DIR="./uploads-test"
```

Edit the local (gitignored) `server/.env.test` the same way — add the line
`UPLOADS_DIR="./uploads-test"`.

- [ ] **Step 5: Commit**

```bash
git add server/package.json package-lock.json .gitignore server/.env.test.example
git commit -m "add multer and file-type deps, configure test uploads dir"
```

---

### Task 2: LocalDiskStorage

**Files:**
- Create: `server/src/lib/storage.ts`
- Test: `server/src/lib/storage.test.ts`

- [ ] **Step 1: Write the failing test**

`server/src/lib/storage.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDiskStorage } from "./storage.js";

describe("LocalDiskStorage", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "billa-uploads-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes the buffer to disk and returns a url scoped to the business", async () => {
    const storage = new LocalDiskStorage(tmpDir);
    const result = await storage.save(Buffer.from("fake-image-bytes"), "biz123", "png");

    expect(result.url).toMatch(/^\/uploads\/biz123\/[\w-]+\.png$/);
    const written = await readFile(result.path);
    expect(written.toString()).toBe("fake-image-bytes");
  });

  it("generates unique filenames for repeated saves", async () => {
    const storage = new LocalDiskStorage(tmpDir);
    const first = await storage.save(Buffer.from("a"), "biz123", "png");
    const second = await storage.save(Buffer.from("b"), "biz123", "png");
    expect(first.url).not.toBe(second.url);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server -- storage.test.ts`
Expected: FAIL — `./storage.js` doesn't exist

- [ ] **Step 3: Implement**

`server/src/lib/storage.ts`:

```ts
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface LogoStorage {
  save(buffer: Buffer, businessId: string, extension: string): Promise<{ url: string; path: string }>;
}

export class LocalDiskStorage implements LogoStorage {
  constructor(private readonly uploadsDir: string) {}

  async save(buffer: Buffer, businessId: string, extension: string): Promise<{ url: string; path: string }> {
    const dir = path.join(this.uploadsDir, businessId);
    await mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    const filePath = path.join(dir, filename);
    await writeFile(filePath, buffer);
    return { url: `/uploads/${businessId}/${filename}`, path: filePath };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=server -- storage.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/storage.ts server/src/lib/storage.test.ts
git commit -m "add local disk logo storage"
```

---

### Task 3: Content-sniffing file type detector

**Files:**
- Create: `server/src/lib/file-sniff.ts`
- Test: `server/src/lib/file-sniff.test.ts`

- [ ] **Step 1: Write the failing test**

`server/src/lib/file-sniff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectAllowedImageType } from "./file-sniff.js";

const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("detectAllowedImageType", () => {
  it("accepts a real PNG", async () => {
    const result = await detectAllowedImageType(MINIMAL_PNG);
    expect(result).toEqual({ ext: "png", mime: "image/png" });
  });

  it("rejects a plain text buffer pretending to be an image", async () => {
    const result = await detectAllowedImageType(Buffer.from("not actually an image"));
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server -- file-sniff.test.ts`
Expected: FAIL — `./file-sniff.js` doesn't exist

- [ ] **Step 3: Implement**

`server/src/lib/file-sniff.ts`:

```ts
import { fileTypeFromBuffer } from "file-type";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function detectAllowedImageType(
  buffer: Buffer,
): Promise<{ ext: string; mime: string } | null> {
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    return null;
  }
  return detected;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=server -- file-sniff.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/file-sniff.ts server/src/lib/file-sniff.test.ts
git commit -m "add content-sniffing image type detector"
```

---

### Task 4: POST /business/logo

**Files:**
- Modify: `server/src/routes/business.ts`
- Test: `server/src/routes/business.logo.test.ts`

- [ ] **Step 1: Write the failing test**

`server/src/routes/business.logo.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
  process.env.UPLOADS_DIR ??= "./uploads-test";
});

beforeEach(resetDb);

const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function registerAndGetCookies(app: ReturnType<typeof createApp>) {
  const res = await request(app).post("/auth/register").send({
    email: "owner@example.com",
    password: "supersecret1",
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

describe("POST /business/logo", () => {
  it("accepts a valid PNG and returns a url", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/business/logo")
      .set("Cookie", cookies)
      .attach("logo", MINIMAL_PNG, "logo.png");

    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/uploads\/[\w-]+\/[\w-]+\.png$/);
  });

  it("rejects a non-image file even with an image extension", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/business/logo")
      .set("Cookie", cookies)
      .attach("logo", Buffer.from("not an image"), "fake.png");

    expect(res.status).toBe(400);
  });

  it("rejects a missing file", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app).post("/business/logo").set("Cookie", cookies);

    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/business/logo").attach("logo", MINIMAL_PNG, "logo.png");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server -- business.logo.test.ts`
Expected: FAIL — route doesn't exist (404)

- [ ] **Step 3: Implement**

Edit `server/src/routes/business.ts` — add the imports:

```ts
import multer from "multer";
import { detectAllowedImageType } from "../lib/file-sniff.js";
import { LocalDiskStorage } from "../lib/storage.js";
```

Then, after the `businessRouter.use(requireAuth);` line, add the multer
config and storage instance:

```ts
const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("logo");

const logoStorage = new LocalDiskStorage(process.env.UPLOADS_DIR ?? "./uploads");
```

Then add the route (multer is wrapped manually so a parse error, like an
oversized file, becomes a JSON 400 instead of Express's default HTML error
page):

```ts
businessRouter.post(
  "/logo",
  (req, res, next) => {
    uploadLogo(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: "upload_failed" });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "no_file" });
      return;
    }

    const detected = await detectAllowedImageType(req.file.buffer);
    if (!detected) {
      res.status(400).json({ error: "invalid_file_type" });
      return;
    }

    const { url } = await logoStorage.save(req.file.buffer, req.auth!.businessId, detected.ext);
    res.status(201).json({ url });
  },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=server -- business.logo.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/business.ts server/src/routes/business.logo.test.ts
git commit -m "add POST /business/logo"
```

---

### Task 5: Static file serving, full suite check, and manual smoke test

**Files:**
- Modify: `server/src/app.ts`

- [ ] **Step 1: Wire up static serving for uploaded files**

Edit `server/src/app.ts` — add the import:

```ts
import express from "express";
```

(already present — just confirm it's there, `express.static` is a method on
the existing import, no new import needed)

Inside `createApp()`, after `app.use(cookieParser());`, add:

```ts
app.use("/uploads", express.static(process.env.UPLOADS_DIR ?? "./uploads"));
```

- [ ] **Step 2: Run the full server and shared test suites**

Run:
```bash
npm run test --workspace=shared
npm run test --workspace=server
```
Expected: all tests PASS, including every file from the auth and business
profile stages plus this stage's new files

- [ ] **Step 3: Typecheck all workspaces**

Run:
```bash
npm run typecheck --workspace=shared
npm run typecheck --workspace=server
npm run typecheck --workspace=client
```
Expected: no errors

- [ ] **Step 4: Manual smoke test against the real dev server**

Run: `npm run dev:server`

In another terminal (from the `server/` directory, so the relative path to a
test PNG is easy — create one first if you don't have one handy):

```bash
curl -i -c cookies.txt -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"logo-smoke@example.com","password":"supersecret1","businessName":"Kigali Traders"}'

curl -i -b cookies.txt -X POST http://localhost:4000/business/logo \
  -F "logo=@/path/to/any/real.png"
```

Take the `url` from the response and fetch it directly to confirm static
serving works:

```bash
curl -i http://localhost:4000/uploads/<businessId>/<filename>.png
```

Expected: register returns 201, the upload returns 201 with a `url`, and
fetching that URL directly returns the image bytes with a 200. Also confirm
`GET /business` still shows `logoUrl: null` — this stage never writes to the
`Business` row.

Delete `cookies.txt` afterward and stop the dev server.

- [ ] **Step 5: Final commit if any cleanup was needed**

If steps 2–4 required fixes, commit them:

```bash
git add -A
git commit -m "fix issues found in logo upload smoke test"
```

If nothing needed fixing, skip this step.
