# Color Extraction & Logo Confirm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a contrast-checked accent palette from a logo via `node-vibrant`, and add the final confirm step that writes `logoUrl`/`primaryColor`/`accentColors` to `Business`, closing out the logo pipeline.

**Architecture:** A shared `readUploadedFile(url, businessId)` helper (extracted from the existing `remove-background` route) enforces tenant-scoped path safety for all logo-processing endpoints. Pure WCAG contrast/HSL math lives in `color.ts`, independently testable. `palette.ts` combines that with `node-vibrant` to pick a primary color and supporting accents. Two new routes (`extract-colors`, `confirm`) follow the same preview/commit split already established by upload and remove-background.

**Tech Stack:** `node-vibrant` (new dependency, runs in-process — no external service needed, unlike the rembg stage). Everything else already in place.

---

### Task 1: Extract shared tenant-path helper, refactor remove-background

**Files:**
- Create: `server/src/lib/uploaded-file.ts`
- Test: `server/src/lib/uploaded-file.test.ts`
- Modify: `server/src/routes/business.ts`

- [ ] **Step 1: Write the failing test**

`server/src/lib/uploaded-file.test.ts`:

```ts
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenUploadPathError, readUploadedFile } from "./uploaded-file.js";

describe("readUploadedFile", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "billa-uploads-"));
    process.env.UPLOADS_DIR = tmpDir;
    await mkdir(path.join(tmpDir, "biz123"), { recursive: true });
    await writeFile(path.join(tmpDir, "biz123", "logo.png"), "logo-bytes");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("reads a file scoped to the business", async () => {
    const buffer = await readUploadedFile("/uploads/biz123/logo.png", "biz123");
    expect(buffer.toString()).toBe("logo-bytes");
  });

  it("rejects a url not starting with /uploads/", async () => {
    await expect(readUploadedFile("/etc/passwd", "biz123")).rejects.toThrow(ForbiddenUploadPathError);
  });

  it("rejects a url belonging to a different business", async () => {
    await expect(readUploadedFile("/uploads/other-biz/logo.png", "biz123")).rejects.toThrow(
      ForbiddenUploadPathError,
    );
  });

  it("rejects a path-traversal attempt", async () => {
    await expect(readUploadedFile("/uploads/biz123/../../../etc/passwd", "biz123")).rejects.toThrow(
      ForbiddenUploadPathError,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server -- uploaded-file.test.ts`
Expected: FAIL — `./uploaded-file.js` doesn't exist

- [ ] **Step 3: Implement**

`server/src/lib/uploaded-file.ts`:

```ts
import path from "node:path";
import { readFile } from "node:fs/promises";

export class ForbiddenUploadPathError extends Error {}

export async function readUploadedFile(url: string, businessId: string): Promise<Buffer> {
  if (!url.startsWith("/uploads/")) {
    throw new ForbiddenUploadPathError();
  }

  const uploadsRoot = path.resolve(process.env.UPLOADS_DIR ?? "./uploads");
  const businessDir = path.resolve(uploadsRoot, businessId);
  const filePath = path.resolve(uploadsRoot, url.slice("/uploads/".length));

  if (!filePath.startsWith(businessDir + path.sep)) {
    throw new ForbiddenUploadPathError();
  }

  return readFile(filePath);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=server -- uploaded-file.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Refactor the remove-background route to use it**

Edit `server/src/routes/business.ts` — add the import:

```ts
import { ForbiddenUploadPathError, readUploadedFile } from "../lib/uploaded-file.js";
```

Replace the body of the `/logo/remove-background` route (everything from
`if (!url.startsWith("/uploads/"))` through the `readFile` try/catch) with:

```ts
  let buffer: Buffer;
  try {
    buffer = await readUploadedFile(url, businessId);
  } catch (err) {
    if (err instanceof ForbiddenUploadPathError) {
      res.status(403).json({ error: "forbidden" });
    } else {
      res.status(404).json({ error: "not_found" });
    }
    return;
  }
```

So the full route becomes:

```ts
businessRouter.post("/logo/remove-background", validateBody(logoUrlSchema), async (req, res) => {
  const { url } = req.body as { url: string };
  const businessId = req.auth!.businessId;

  let buffer: Buffer;
  try {
    buffer = await readUploadedFile(url, businessId);
  } catch (err) {
    if (err instanceof ForbiddenUploadPathError) {
      res.status(403).json({ error: "forbidden" });
    } else {
      res.status(404).json({ error: "not_found" });
    }
    return;
  }

  const detection = await detectBackground(buffer);

  if (!detection.needsRemoval) {
    res.json({ url, backgroundRemoved: false, detection });
    return;
  }

  const processed = await removeBackground(buffer);
  const saved = await logoStorage.save(processed, businessId, "png");
  res.json({ url: saved.url, backgroundRemoved: true, detection });
});
```

`path` and `readFile` were only ever used inside this route for the manual
path-resolution logic just replaced — remove both now-unused imports:
`import path from "node:path";` and `import { readFile } from "node:fs/promises";`.

- [ ] **Step 6: Run the existing remove-background tests to confirm the refactor didn't break anything**

Run: `npm run test --workspace=server -- business.remove-background.test.ts`
Expected: PASS (4 tests) — unchanged behavior, same test file as before

- [ ] **Step 7: Commit**

```bash
git add server/src/lib/uploaded-file.ts server/src/lib/uploaded-file.test.ts server/src/routes/business.ts
git commit -m "extract shared tenant-path helper for logo endpoints"
```

---

### Task 2: WCAG contrast math

**Files:**
- Create: `server/src/lib/color.ts`
- Test: `server/src/lib/color.test.ts`

- [ ] **Step 1: Write the failing test**

`server/src/lib/color.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { contrastRatio, darkenUntilContrast } from "./color.js";

describe("contrastRatio", () => {
  it("returns 21 for black on white (max contrast)", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });

  it("returns 1 for identical colors (no contrast)", () => {
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("is symmetric regardless of argument order", () => {
    const a = contrastRatio("#FF0000", "#FFFFFF");
    const b = contrastRatio("#FFFFFF", "#FF0000");
    expect(a).toBeCloseTo(b, 10);
  });
});

describe("darkenUntilContrast", () => {
  it("darkens a low-contrast light color until it meets the threshold", () => {
    const result = darkenUntilContrast("#FFEE99", 3);
    expect(result.ratio).toBeGreaterThanOrEqual(3);
  });

  it("leaves an already-sufficient color's ratio essentially unchanged", () => {
    const before = contrastRatio("#000000", "#FFFFFF");
    const result = darkenUntilContrast("#000000", 3);
    expect(result.ratio).toBeCloseTo(before, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server -- color.test.ts`
Expected: FAIL — `./color.js` doesn't exist

- [ ] **Step 3: Implement**

`server/src/lib/color.ts`:

```ts
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rl, gl, bl] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexToRgb(hexA));
  const lumB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r1, g1, b1] = [0, 0, 0];
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

export function darkenUntilContrast(
  hex: string,
  minRatio: number,
  background = "#FFFFFF",
): { hex: string; ratio: number } {
  const [r, g, b] = hexToRgb(hex);
  const [h, s] = rgbToHsl(r, g, b);
  let l = rgbToHsl(r, g, b)[2];
  let candidateHex = hex.toUpperCase();
  let ratio = contrastRatio(candidateHex, background);

  while (ratio < minRatio && l > 0) {
    l = Math.max(0, l - 5);
    const [dr, dg, db] = hslToRgb(h, s, l);
    candidateHex = rgbToHex(dr, dg, db);
    ratio = contrastRatio(candidateHex, background);
  }

  return { hex: candidateHex, ratio };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=server -- color.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/color.ts server/src/lib/color.test.ts
git commit -m "add WCAG contrast ratio and HSL darkening helpers"
```

---

### Task 3: Palette extraction

**Files:**
- Modify: `server/package.json`
- Create: `server/src/lib/palette.ts`
- Test: `server/src/lib/palette.test.ts`

- [ ] **Step 1: Add the `node-vibrant` dependency**

Edit `server/package.json`, add to `"dependencies"`:

```json
"node-vibrant": "^4.0.4"
```

Run: `npm install --workspace=server`

- [ ] **Step 2: Write the failing test**

`server/src/lib/palette.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { extractPalette } from "./palette.js";

async function makeTwoToneImage(): Promise<Buffer> {
  const square = await sharp({
    create: { width: 40, height: 40, channels: 3, background: { r: 230, g: 60, b: 40 } },
  })
    .png()
    .toBuffer();

  return sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 20, g: 90, b: 200 } },
  })
    .composite([{ input: square, left: 30, top: 30 }])
    .png()
    .toBuffer();
}

describe("extractPalette", () => {
  it("returns a primary color with sufficient contrast against white", async () => {
    const buffer = await makeTwoToneImage();
    const result = await extractPalette(buffer);

    expect(result.primaryColor).toMatch(/^#[0-9A-F]{6}$/);
    expect(result.contrastRatio).toBeGreaterThanOrEqual(3);
  });

  it("returns up to 3 accent colors distinct from the primary", async () => {
    const buffer = await makeTwoToneImage();
    const result = await extractPalette(buffer);

    expect(result.accentColors.length).toBeLessThanOrEqual(3);
    expect(result.accentColors).not.toContain(result.primaryColor);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace=server -- palette.test.ts`
Expected: FAIL — `./palette.js` doesn't exist

- [ ] **Step 4: Implement**

`server/src/lib/palette.ts`:

```ts
import { Vibrant } from "node-vibrant/node";
import { contrastRatio, darkenUntilContrast } from "./color.js";

export interface ExtractedPalette {
  primaryColor: string;
  accentColors: string[];
  contrastRatio: number;
}

const MIN_CONTRAST_RATIO = 3;
const WHITE = "#FFFFFF";

export async function extractPalette(buffer: Buffer): Promise<ExtractedPalette> {
  const palette = await Vibrant.from(buffer).getPalette();

  const candidates = [
    palette.Vibrant,
    palette.DarkVibrant,
    palette.Muted,
    palette.DarkMuted,
    palette.LightVibrant,
    palette.LightMuted,
  ]
    .filter((swatch): swatch is NonNullable<typeof swatch> => swatch != null)
    .sort((a, b) => b.population - a.population);

  if (candidates.length === 0) {
    throw new Error("no usable colors found in image");
  }

  let primaryHex = candidates[0].hex.toUpperCase();
  let ratio = contrastRatio(primaryHex, WHITE);

  for (const candidate of candidates) {
    const candidateRatio = contrastRatio(candidate.hex, WHITE);
    if (candidateRatio >= MIN_CONTRAST_RATIO) {
      primaryHex = candidate.hex.toUpperCase();
      ratio = candidateRatio;
      break;
    }
  }

  if (ratio < MIN_CONTRAST_RATIO) {
    const darkened = darkenUntilContrast(primaryHex, MIN_CONTRAST_RATIO);
    primaryHex = darkened.hex;
    ratio = darkened.ratio;
  }

  const accentColors = candidates
    .map((c) => c.hex.toUpperCase())
    .filter((hex) => hex !== primaryHex)
    .slice(0, 3);

  return { primaryColor: primaryHex, accentColors, contrastRatio: ratio };
}
```

If `Vibrant.from(buffer)` doesn't accept a `Buffer` directly in the installed
version (check the actual installed `node-vibrant` API if this errors), fall
back to `new Vibrant(buffer)` — both are documented entry points for v4's
Node build.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=server -- palette.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add server/package.json package-lock.json server/src/lib/palette.ts server/src/lib/palette.test.ts
git commit -m "add node-vibrant palette extraction with contrast checking"
```

---

### Task 4: Shared confirm-logo schema

**Files:**
- Modify: `shared/src/logo-schemas.ts`
- Modify: `shared/src/logo-schemas.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `shared/src/logo-schemas.test.ts`:

```ts
import { confirmLogoSchema } from "./logo-schemas.js";

describe("confirmLogoSchema", () => {
  it("accepts a valid confirm payload", () => {
    const result = confirmLogoSchema.safeParse({
      url: "/uploads/biz123/logo.png",
      primaryColor: "#C2185B",
      accentColors: ["#E0F2FE", "#8F1144"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty accentColors array", () => {
    const result = confirmLogoSchema.safeParse({
      url: "/uploads/biz123/logo.png",
      primaryColor: "#C2185B",
      accentColors: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid hex color", () => {
    const result = confirmLogoSchema.safeParse({
      url: "/uploads/biz123/logo.png",
      primaryColor: "not-a-color",
      accentColors: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing primaryColor", () => {
    const result = confirmLogoSchema.safeParse({
      url: "/uploads/biz123/logo.png",
      accentColors: [],
    });
    expect(result.success).toBe(false);
  });
});
```

(add the `confirmLogoSchema` import to the existing `import { logoUrlSchema } from "./logo-schemas.js";`
line at the top of the file rather than a second import statement)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=shared`
Expected: FAIL — `confirmLogoSchema` doesn't exist

- [ ] **Step 3: Implement**

Edit `shared/src/logo-schemas.ts`, replace its full contents with:

```ts
import { z } from "zod";

const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;

export const logoUrlSchema = z.object({
  url: z.string().min(1),
});
export type LogoUrlInput = z.infer<typeof logoUrlSchema>;

export const confirmLogoSchema = z.object({
  url: z.string().min(1),
  primaryColor: z.string().regex(hexColorPattern),
  accentColors: z.array(z.string().regex(hexColorPattern)).max(6),
});
export type ConfirmLogoInput = z.infer<typeof confirmLogoSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=shared`
Expected: PASS (4 new tests)

- [ ] **Step 5: Commit**

```bash
git add shared/src/logo-schemas.ts shared/src/logo-schemas.test.ts
git commit -m "add confirmLogoSchema"
```

---

### Task 5: POST /business/logo/extract-colors

**Files:**
- Modify: `server/src/routes/business.ts`
- Test: `server/src/routes/business.extract-colors.test.ts`

- [ ] **Step 1: Write the failing test**

`server/src/routes/business.extract-colors.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
  process.env.UPLOADS_DIR ??= "./uploads-test";
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

async function uploadTwoToneLogo(app: ReturnType<typeof createApp>, cookies: string[]) {
  const square = await sharp({
    create: { width: 20, height: 20, channels: 4, background: { r: 230, g: 60, b: 40, alpha: 1 } },
  })
    .png()
    .toBuffer();
  const buffer = await sharp({
    create: { width: 50, height: 50, channels: 4, background: { r: 20, g: 90, b: 200, alpha: 1 } },
  })
    .composite([{ input: square, left: 15, top: 15 }])
    .png()
    .toBuffer();

  const res = await request(app).post("/business/logo").set("Cookie", cookies).attach("logo", buffer, "logo.png");
  return res.body.url as string;
}

describe("POST /business/logo/extract-colors", () => {
  it("returns a primary color and accents for an uploaded logo", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const url = await uploadTwoToneLogo(app, cookies);

    const res = await request(app)
      .post("/business/logo/extract-colors")
      .set("Cookie", cookies)
      .send({ url });

    expect(res.status).toBe(200);
    expect(res.body.primaryColor).toMatch(/^#[0-9A-F]{6}$/);
    expect(Array.isArray(res.body.accentColors)).toBe(true);
    expect(res.body.contrastRatio).toBeGreaterThanOrEqual(3);
  });

  it("rejects a url belonging to a different business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    await uploadTwoToneLogo(app, cookies);

    const res = await request(app)
      .post("/business/logo/extract-colors")
      .set("Cookie", cookies)
      .send({ url: "/uploads/some-other-business/file.png" });

    expect(res.status).toBe(403);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp())
      .post("/business/logo/extract-colors")
      .send({ url: "/uploads/x/y.png" });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server -- business.extract-colors.test.ts`
Expected: FAIL — route doesn't exist (404)

- [ ] **Step 3: Implement**

Edit `server/src/routes/business.ts` — add the import:

```ts
import { extractPalette } from "../lib/palette.js";
```

Then add the route:

```ts
businessRouter.post("/logo/extract-colors", validateBody(logoUrlSchema), async (req, res) => {
  const { url } = req.body as { url: string };
  const businessId = req.auth!.businessId;

  let buffer: Buffer;
  try {
    buffer = await readUploadedFile(url, businessId);
  } catch (err) {
    if (err instanceof ForbiddenUploadPathError) {
      res.status(403).json({ error: "forbidden" });
    } else {
      res.status(404).json({ error: "not_found" });
    }
    return;
  }

  const palette = await extractPalette(buffer);
  res.json(palette);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=server -- business.extract-colors.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/business.ts server/src/routes/business.extract-colors.test.ts
git commit -m "add POST /business/logo/extract-colors"
```

---

### Task 6: POST /business/logo/confirm

**Files:**
- Modify: `server/src/routes/business.ts`
- Test: `server/src/routes/business.confirm-logo.test.ts`

- [ ] **Step 1: Write the failing test**

`server/src/routes/business.confirm-logo.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
  process.env.UPLOADS_DIR ??= "./uploads-test";
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

async function uploadLogo(app: ReturnType<typeof createApp>, cookies: string[]) {
  const buffer = await sharp({
    create: { width: 20, height: 20, channels: 4, background: { r: 200, g: 100, b: 50, alpha: 1 } },
  })
    .png()
    .toBuffer();

  const res = await request(app).post("/business/logo").set("Cookie", cookies).attach("logo", buffer, "logo.png");
  return res.body.url as string;
}

describe("POST /business/logo/confirm", () => {
  it("writes logoUrl, primaryColor, and accentColors to the business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const url = await uploadLogo(app, cookies);

    const res = await request(app)
      .post("/business/logo/confirm")
      .set("Cookie", cookies)
      .send({ url, primaryColor: "#C2185B", accentColors: ["#E0F2FE", "#8F1144"] });

    expect(res.status).toBe(200);
    expect(res.body.business.logoUrl).toBe(url);
    expect(res.body.business.primaryColor).toBe("#C2185B");
    expect(res.body.business.accentColors).toEqual(["#E0F2FE", "#8F1144"]);
  });

  it("rejects an invalid hex color", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const url = await uploadLogo(app, cookies);

    const res = await request(app)
      .post("/business/logo/confirm")
      .set("Cookie", cookies)
      .send({ url, primaryColor: "not-a-color", accentColors: [] });

    expect(res.status).toBe(400);
  });

  it("rejects a url belonging to a different business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);

    const res = await request(app)
      .post("/business/logo/confirm")
      .set("Cookie", cookies)
      .send({ url: "/uploads/some-other-business/file.png", primaryColor: "#C2185B", accentColors: [] });

    expect(res.status).toBe(403);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp())
      .post("/business/logo/confirm")
      .send({ url: "/uploads/x/y.png", primaryColor: "#C2185B", accentColors: [] });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=server -- business.confirm-logo.test.ts`
Expected: FAIL — route doesn't exist (404)

- [ ] **Step 3: Implement**

Edit `server/src/routes/business.ts` — add `confirmLogoSchema` to the
existing `@billa/shared` import line:

```ts
import { businessProfileSchema, confirmLogoSchema, logoUrlSchema, updateSequencesSchema } from "@billa/shared";
```

Then add the route:

```ts
businessRouter.post("/logo/confirm", validateBody(confirmLogoSchema), async (req, res) => {
  const { url, primaryColor, accentColors } = req.body as {
    url: string;
    primaryColor: string;
    accentColors: string[];
  };
  const businessId = req.auth!.businessId;

  try {
    await readUploadedFile(url, businessId);
  } catch (err) {
    if (err instanceof ForbiddenUploadPathError) {
      res.status(403).json({ error: "forbidden" });
    } else {
      res.status(404).json({ error: "not_found" });
    }
    return;
  }

  const business = await prisma.business.update({
    where: { id: businessId },
    data: { logoUrl: url, primaryColor, accentColors },
  });

  res.json({ business });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=server -- business.confirm-logo.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/business.ts server/src/routes/business.confirm-logo.test.ts
git commit -m "add POST /business/logo/confirm"
```

---

### Task 7: Full suite check, typecheck, and manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Run the full shared and server test suites**

Run:
```bash
npm run test --workspace=shared
npm run test --workspace=server
```
Expected: all tests PASS, including every file from prior stages plus this
stage's new files

- [ ] **Step 2: Typecheck all workspaces**

Run:
```bash
npm run typecheck --workspace=shared
npm run typecheck --workspace=server
npm run typecheck --workspace=client
```
Expected: no errors

- [ ] **Step 3: Manual smoke test against the real dev server**

`node-vibrant` runs in-process, so unlike the background-removal stage, no
second service is needed here — just `npm run dev:server`.

```bash
curl -s -c cookies.txt -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"palette-smoke@example.com","password":"supersecret1","businessName":"Kigali Traders"}'

curl -s -b cookies.txt -X POST http://localhost:4000/business/logo -F "logo=@/path/to/any/real.png"
```

Take the `url` from that response, then:

```bash
curl -s -b cookies.txt -X POST http://localhost:4000/business/logo/extract-colors \
  -H "Content-Type: application/json" \
  -d '{"url":"<url-from-upload>"}'
```

Take the `primaryColor`/`accentColors` from that response (or make up your
own hex values to simulate a manual override), then:

```bash
curl -s -b cookies.txt -X POST http://localhost:4000/business/logo/confirm \
  -H "Content-Type: application/json" \
  -d '{"url":"<url-from-upload>","primaryColor":"<hex>","accentColors":["<hex>","<hex>"]}'

curl -s -b cookies.txt http://localhost:4000/business
```

Expected: `extract-colors` returns a valid palette, `confirm` returns the
updated business with `logoUrl`/`primaryColor`/`accentColors` all set, and
the final `GET /business` confirms those values persisted.

Delete `cookies.txt` afterward and stop the dev server.

- [ ] **Step 4: Final commit if any cleanup was needed**

If steps 1–3 required fixes, commit them:

```bash
git add -A
git commit -m "fix issues found in color extraction smoke test"
```

If nothing needed fixing, skip this step.
