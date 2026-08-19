# PDF Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate downloadable PDFs (all three templates: MINIMAL, FORMAL, SIDEBAR_ACCENT) for any document, draft or finalized, reachable from the document form/view and the documents list, plus a Business Settings page to actually pick a business's default template.

**Architecture:** Server-side HTML string templates (one pure function per template) rendered to PDF via a single warm Puppeteer/headless-Chromium instance. Logo and brand fonts are embedded as base64 data URIs so rendering is self-contained. A new `GET /documents/:id/pdf` route streams the result; the client triggers it with a plain `window.open` since it's an authenticated GET the browser already handles.

**Tech Stack:** Puppeteer (new), existing Express/Prisma server, existing React/Vite client, `@fontsource-variable/fraunces` + `@fontsource-variable/plus-jakarta-sans` (already used by the client, now also needed server-side).

Reference: `docs/superpowers/specs/2026-08-19-pdf-rendering-design.md`

---

### Task 1: Server dependencies

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Install Puppeteer**

Run: `npm install puppeteer --workspace=server`
Expected: adds `puppeteer` to `server/package.json` dependencies and downloads its bundled Chromium (may take a minute).

- [ ] **Step 2: Install the brand font packages as a server dependency**

Run: `npm install @fontsource-variable/fraunces @fontsource-variable/plus-jakarta-sans --workspace=server`
Expected: adds both to `server/package.json` dependencies. They're already installed at the workspace root for the client; this just makes the server workspace's own `package.json` declare what it actually uses, per npm workspaces convention.

- [ ] **Step 3: Verify the server still boots**

Run: `cd server && npm run typecheck`
Expected: passes with no errors (no code changes yet, just new dependencies).

- [ ] **Step 4: Commit**

```bash
git add server/package.json server/package-lock.json package-lock.json
git commit -m "add puppeteer and brand font packages to server"
```

---

### Task 2: Move `formatRwf` to shared

**Files:**
- Create: `shared/src/money.ts`
- Create: `shared/src/money.test.ts`
- Modify: `shared/src/index.ts`
- Delete: `client/src/lib/money.ts`
- Delete: `client/src/lib/money.test.ts`
- Modify: `client/src/pages/DocumentForm.tsx`
- Modify: `client/src/pages/DocumentView.tsx`
- Modify: `client/src/pages/Documents.tsx`
- Modify: `client/src/pages/Items.tsx`

- [ ] **Step 1: Write the failing test in shared**

Create `shared/src/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatRwf } from "./money.js";

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

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd shared && npx vitest run src/money.test.ts`
Expected: FAIL, `Cannot find module './money.js'` (or similar).

- [ ] **Step 3: Create the implementation**

Create `shared/src/money.ts`:

```ts
export function formatRwf(amountInRwf: number): string {
  return `${amountInRwf.toLocaleString("en-US")} RWF`;
}
```

- [ ] **Step 4: Export it from the shared package**

In `shared/src/index.ts`, add:

```ts
export * from "./money.js";
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `cd shared && npx vitest run src/money.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Delete the client copies**

```bash
git rm client/src/lib/money.ts client/src/lib/money.test.ts
```

- [ ] **Step 7: Update every client import**

In `client/src/pages/DocumentForm.tsx`, `client/src/pages/DocumentView.tsx`, `client/src/pages/Documents.tsx`, and `client/src/pages/Items.tsx`, change:

```ts
import { formatRwf } from "../lib/money";
```

to:

```ts
import { formatRwf } from "@billa/shared";
```

- [ ] **Step 8: Run the full client and shared suites**

Run: `cd shared && npm test && cd ../client && npm test`
Expected: all pass, no import errors.

- [ ] **Step 9: Commit**

```bash
git add shared/src/money.ts shared/src/money.test.ts shared/src/index.ts client/src/lib/money.ts client/src/lib/money.test.ts client/src/pages/DocumentForm.tsx client/src/pages/DocumentView.tsx client/src/pages/Documents.tsx client/src/pages/Items.tsx
git commit -m "move formatRwf into shared so the server can use it too"
```

---

### Task 3: `defaultTemplate` on `businessProfileSchema`

**Files:**
- Modify: `shared/src/business-schemas.ts`
- Test: `shared/src/business-schemas.test.ts`

- [ ] **Step 1: Write the failing test**

Find the existing `describe("businessProfileSchema"` block in `shared/src/business-schemas.test.ts` (or add one matching the file's existing style) and add:

```ts
it("accepts a valid defaultTemplate", () => {
  const result = businessProfileSchema.safeParse({ defaultTemplate: "FORMAL" });
  expect(result.success).toBe(true);
});

it("rejects an invalid defaultTemplate", () => {
  const result = businessProfileSchema.safeParse({ defaultTemplate: "NEON" });
  expect(result.success).toBe(false);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd shared && npx vitest run src/business-schemas.test.ts`
Expected: FAIL, `defaultTemplate` is stripped/unrecognized so `safeParse` either fails validation for the first case or the field is silently dropped (test written to catch that the field isn't accepted yet).

- [ ] **Step 3: Add the field**

In `shared/src/business-schemas.ts`, add the import and field:

```ts
import { z } from "zod";
import { DOCUMENT_TYPES, DOCUMENT_TEMPLATES } from "./document-types.js";

export const businessProfileSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    tin: z.string().trim().min(1).optional(),
    industry: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    email: z.string().email().optional(),
    address: z.string().trim().min(1).optional(),
    rraEbmNumber: z.string().trim().min(1).optional(),
    defaultTemplate: z.enum(DOCUMENT_TEMPLATES).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "at least one field is required",
  });
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd shared && npx vitest run src/business-schemas.test.ts`
Expected: PASS, all tests including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add shared/src/business-schemas.ts shared/src/business-schemas.test.ts
git commit -m "accept defaultTemplate on the business profile schema"
```

---

### Task 4: Embedded font assets

**Files:**
- Create: `server/src/lib/pdf/assets.ts`
- Test: `server/src/lib/pdf/assets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/pdf/assets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FONT_FACE_CSS } from "./assets.js";

describe("FONT_FACE_CSS", () => {
  it("embeds both brand fonts as base64 data URIs", () => {
    expect(FONT_FACE_CSS).toContain('font-family: "Fraunces"');
    expect(FONT_FACE_CSS).toContain('font-family: "Plus Jakarta Sans"');
    expect(FONT_FACE_CSS).toMatch(/data:font\/woff2;base64,[A-Za-z0-9+/]+/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/lib/pdf/assets.test.ts`
Expected: FAIL, `Cannot find module './assets.js'`.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/pdf/assets.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readFontAsBase64(specifier: string): string {
  const resolvedUrl = import.meta.resolve(specifier);
  const filePath = fileURLToPath(resolvedUrl);
  return readFileSync(filePath).toString("base64");
}

const FRAUNCES_BASE64 = readFontAsBase64(
  "@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2",
);
const PLUS_JAKARTA_SANS_BASE64 = readFontAsBase64(
  "@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2",
);

export const FONT_FACE_CSS = `
@font-face {
  font-family: "Fraunces";
  src: url(data:font/woff2;base64,${FRAUNCES_BASE64}) format("woff2");
  font-weight: 300 900;
  font-style: normal;
}
@font-face {
  font-family: "Plus Jakarta Sans";
  src: url(data:font/woff2;base64,${PLUS_JAKARTA_SANS_BASE64}) format("woff2");
  font-weight: 200 800;
  font-style: normal;
}
`;
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd server && npx vitest run src/lib/pdf/assets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/pdf/assets.ts server/src/lib/pdf/assets.test.ts
git commit -m "embed brand fonts as base64 for self-contained PDF rendering"
```

---

### Task 5: `escapeHtml` helper

**Files:**
- Create: `server/src/lib/pdf/escape-html.ts`
- Test: `server/src/lib/pdf/escape-html.test.ts`

Every piece of user-entered text (business name, customer name/address, line descriptions, notes) gets interpolated directly into an HTML string that a real browser then renders. Without escaping, a customer name like `<img src=x onerror=...>` would execute inside the headless page. This helper is applied centrally in Task 7 so no template has to remember to call it.

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/pdf/escape-html.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { escapeHtml } from "./escape-html.js";

describe("escapeHtml", () => {
  it("escapes the five HTML special characters", () => {
    expect(escapeHtml(`<script>alert("hi") & 'bye'</script>`)).toBe(
      "&lt;script&gt;alert(&quot;hi&quot;) &amp; &#39;bye&#39;&lt;/script&gt;",
    );
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Kigali Traders Ltd")).toBe("Kigali Traders Ltd");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/lib/pdf/escape-html.test.ts`
Expected: FAIL, `Cannot find module './escape-html.js'`.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/pdf/escape-html.ts`:

```ts
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd server && npx vitest run src/lib/pdf/escape-html.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/pdf/escape-html.ts server/src/lib/pdf/escape-html.test.ts
git commit -m "add HTML-escaping helper for PDF templates"
```

---

### Task 6: `readLogoDataUri`

**Files:**
- Create: `server/src/lib/pdf/logo.ts`
- Test: `server/src/lib/pdf/logo.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/lib/pdf/logo.test.ts`:

```ts
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { readLogoDataUri } from "./logo.js";

const UPLOADS_DIR = "./uploads-test-pdf-logo";
const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

beforeAll(async () => {
  process.env.UPLOADS_DIR = UPLOADS_DIR;
  await rm(UPLOADS_DIR, { recursive: true, force: true });
  await mkdir(path.join(UPLOADS_DIR, "biz1"), { recursive: true });
  await writeFile(path.join(UPLOADS_DIR, "biz1", "logo.png"), MINIMAL_PNG);
});

describe("readLogoDataUri", () => {
  it("returns null when there is no logo url", async () => {
    expect(await readLogoDataUri(null, "biz1")).toBeNull();
  });

  it("returns a base64 data URI for a real logo file", async () => {
    const result = await readLogoDataUri("/uploads/biz1/logo.png", "biz1");
    expect(result).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
  });

  it("returns null when the file does not exist on disk", async () => {
    const result = await readLogoDataUri("/uploads/biz1/missing.png", "biz1");
    expect(result).toBeNull();
  });

  it("returns null when the url points outside the business's own folder", async () => {
    const result = await readLogoDataUri("/uploads/other-biz/logo.png", "biz1");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/lib/pdf/logo.test.ts`
Expected: FAIL, `Cannot find module './logo.js'`.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/pdf/logo.ts`:

```ts
import { readUploadedFile } from "../uploaded-file.js";
import { detectAllowedImageType } from "../file-sniff.js";

export async function readLogoDataUri(
  logoUrl: string | null,
  businessId: string,
): Promise<string | null> {
  if (!logoUrl) {
    return null;
  }

  try {
    const buffer = await readUploadedFile(logoUrl, businessId);
    const detected = await detectAllowedImageType(buffer);
    if (!detected) {
      return null;
    }
    return `data:${detected.mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd server && npx vitest run src/lib/pdf/logo.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/pdf/logo.ts server/src/lib/pdf/logo.test.ts
git commit -m "add logo-to-data-URI helper for PDF templates"
```

---

### Task 7: `PdfRenderData` and `buildPdfRenderData`

**Files:**
- Create: `server/src/lib/pdf/render-data.ts`
- Test: `server/src/lib/pdf/render-data.test.ts`

This is the normalization layer: it takes Prisma's raw document/business shapes and produces a flat, fully-formatted, fully-escaped object every template function can trust and interpolate directly.

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/pdf/render-data.test.ts`:

```ts
import { Decimal } from "@prisma/client/runtime/library";
import { describe, expect, it } from "vitest";
import { buildPdfRenderData } from "./render-data.js";
import type { Business, Customer, Document, DocumentLine } from "@prisma/client";

function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: "biz1",
    name: "Kigali Traders <Ltd>",
    tin: "123",
    industry: null,
    phone: "+250788000000",
    email: "hi@kigali.rw",
    address: "KG 7 Ave",
    logoUrl: null,
    primaryColor: "#C2185B",
    accentColors: null,
    rraEbmNumber: "EBM-1",
    defaultTemplate: "MINIMAL",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDocument(
  overrides: Partial<Document> = {},
): Document & { lines: DocumentLine[]; customer: Customer } {
  return {
    id: "doc1",
    businessId: "biz1",
    type: "INVOICE",
    number: "INV-0001",
    status: "FINALIZED",
    template: "MINIMAL",
    customerId: "cust1",
    issueDate: new Date("2026-08-18T00:00:00.000Z"),
    dueDate: null,
    notes: null,
    subtotal: 15000,
    taxTotal: 2700,
    total: 17700,
    convertedFromId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    customer: {
      id: "cust1",
      businessId: "biz1",
      name: "Customer & Co",
      tin: null,
      address: null,
      phone: null,
      email: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    lines: [
      {
        id: "line1",
        documentId: "doc1",
        itemId: null,
        description: "Printing service",
        quantity: new Decimal("3.00"),
        unitPrice: 5000,
        taxRate: new Decimal("18.00"),
        lineTotal: 15000,
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}

describe("buildPdfRenderData", () => {
  it("escapes user-controlled text fields", async () => {
    const data = await buildPdfRenderData(makeDocument(), makeBusiness());
    expect(data.business.name).toBe("Kigali Traders &lt;Ltd&gt;");
    expect(data.customer.name).toBe("Customer &amp; Co");
  });

  it("formats totals and line amounts with formatRwf", async () => {
    const data = await buildPdfRenderData(makeDocument(), makeBusiness());
    expect(data.subtotalFormatted).toBe("15,000 RWF");
    expect(data.totalFormatted).toBe("17,700 RWF");
    expect(data.lines[0].lineTotalFormatted).toBe("15,000 RWF");
    expect(data.lines[0].quantity).toBe("3");
    expect(data.lines[0].taxRateFormatted).toBe("18%");
  });

  it("falls back to a neutral accent color when the business has none", async () => {
    const data = await buildPdfRenderData(makeDocument(), makeBusiness({ primaryColor: null }));
    expect(data.business.accentColor).toBe("#27272a");
  });

  it("uses the business's own primary color as the accent when set", async () => {
    const data = await buildPdfRenderData(makeDocument(), makeBusiness({ primaryColor: "#C2185B" }));
    expect(data.business.accentColor).toBe("#C2185B");
  });

  it("shows a null number for a draft", async () => {
    const data = await buildPdfRenderData(makeDocument({ number: null, status: "DRAFT" }), makeBusiness());
    expect(data.number).toBeNull();
    expect(data.status).toBe("DRAFT");
  });

  it("resolves a human-readable type label", async () => {
    const data = await buildPdfRenderData(makeDocument({ type: "DELIVERY_NOTE" }), makeBusiness());
    expect(data.typeLabel).toBe("Delivery Note");
  });

  it("returns a null logo when the business has none", async () => {
    const data = await buildPdfRenderData(makeDocument(), makeBusiness({ logoUrl: null }));
    expect(data.business.logoDataUri).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/lib/pdf/render-data.test.ts`
Expected: FAIL, `Cannot find module './render-data.js'`.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/pdf/render-data.ts`:

```ts
import type { Business, Customer, Document, DocumentLine, DocumentType } from "@prisma/client";
import { formatRwf } from "@billa/shared";
import { escapeHtml } from "./escape-html.js";
import { readLogoDataUri } from "./logo.js";

const DEFAULT_ACCENT = "#27272a";

const TYPE_LABELS: Record<DocumentType, string> = {
  INVOICE: "Invoice",
  PROFORMA: "Proforma Invoice",
  DELIVERY_NOTE: "Delivery Note",
  QUOTE: "Quote",
  RECEIPT: "Receipt",
};

export interface PdfRenderLine {
  description: string;
  quantity: string;
  unitPriceFormatted: string;
  taxRateFormatted: string;
  lineTotalFormatted: string;
}

export interface PdfRenderData {
  business: {
    name: string;
    tin: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    rraEbmNumber: string | null;
    accentColor: string;
    logoDataUri: string | null;
  };
  customer: {
    name: string;
    tin: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  typeLabel: string;
  number: string | null;
  status: "DRAFT" | "FINALIZED";
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  lines: PdfRenderLine[];
  subtotalFormatted: string;
  taxTotalFormatted: string;
  totalFormatted: string;
}

type DocumentWithRelations = Document & { lines: DocumentLine[]; customer: Customer };

function escapeNullable(value: string | null): string | null {
  return value === null ? null : escapeHtml(value);
}

export async function buildPdfRenderData(
  document: DocumentWithRelations,
  business: Business,
): Promise<PdfRenderData> {
  const logoDataUri = await readLogoDataUri(business.logoUrl, business.id);

  return {
    business: {
      name: escapeHtml(business.name),
      tin: escapeNullable(business.tin),
      address: escapeNullable(business.address),
      phone: escapeNullable(business.phone),
      email: escapeNullable(business.email),
      rraEbmNumber: escapeNullable(business.rraEbmNumber),
      accentColor: business.primaryColor ?? DEFAULT_ACCENT,
      logoDataUri,
    },
    customer: {
      name: escapeHtml(document.customer.name),
      tin: escapeNullable(document.customer.tin),
      address: escapeNullable(document.customer.address),
      phone: escapeNullable(document.customer.phone),
      email: escapeNullable(document.customer.email),
    },
    typeLabel: TYPE_LABELS[document.type],
    number: document.number,
    status: document.status,
    issueDate: document.issueDate.toISOString().slice(0, 10),
    dueDate: document.dueDate ? document.dueDate.toISOString().slice(0, 10) : null,
    notes: escapeNullable(document.notes),
    lines: [...document.lines]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((line) => ({
        description: escapeHtml(line.description),
        quantity: line.quantity.toString(),
        unitPriceFormatted: formatRwf(line.unitPrice),
        taxRateFormatted: `${line.taxRate.toString()}%`,
        lineTotalFormatted: formatRwf(line.lineTotal),
      })),
    subtotalFormatted: formatRwf(document.subtotal),
    taxTotalFormatted: formatRwf(document.taxTotal),
    totalFormatted: formatRwf(document.total),
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd server && npx vitest run src/lib/pdf/render-data.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/pdf/render-data.ts server/src/lib/pdf/render-data.test.ts
git commit -m "add PdfRenderData normalization layer"
```

---

### Task 8: Shared HTML shell

**Files:**
- Create: `server/src/lib/pdf/html-shell.ts`
- Test: `server/src/lib/pdf/html-shell.test.ts`

Every template wraps its body in the same document skeleton (fonts, reset, A4 page sizing). Keeping this in one place means each template file only contains what's actually different about it.

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/pdf/html-shell.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { htmlDocumentShell } from "./html-shell.js";

describe("htmlDocumentShell", () => {
  it("wraps the body in a full HTML document with the title and fonts embedded", () => {
    const html = htmlDocumentShell("INV-0001", "", "<p>hello</p>");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>INV-0001</title>");
    expect(html).toContain("<p>hello</p>");
    expect(html).toContain('font-family: "Fraunces"');
  });

  it("includes any extra template-specific styles passed in", () => {
    const html = htmlDocumentShell("t", ".sidebar { width: 30%; }", "<div></div>");
    expect(html).toContain(".sidebar { width: 30%; }");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/lib/pdf/html-shell.test.ts`
Expected: FAIL, `Cannot find module './html-shell.js'`.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/pdf/html-shell.ts`:

```ts
import { FONT_FACE_CSS } from "./assets.js";

export function htmlDocumentShell(title: string, extraStyles: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
${FONT_FACE_CSS}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: "Plus Jakarta Sans", sans-serif;
  color: #1f2937;
  font-size: 11px;
  line-height: 1.5;
}
table { width: 100%; border-collapse: collapse; }
${extraStyles}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd server && npx vitest run src/lib/pdf/html-shell.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/pdf/html-shell.ts server/src/lib/pdf/html-shell.test.ts
git commit -m "add shared HTML document shell for PDF templates"
```

---

### Task 9: MINIMAL template

**Files:**
- Create: `server/src/lib/pdf/minimal-template.ts`
- Test: `server/src/lib/pdf/minimal-template.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/lib/pdf/minimal-template.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderMinimalHtml } from "./minimal-template.js";
import type { PdfRenderData } from "./render-data.js";

function makeData(overrides: Partial<PdfRenderData> = {}): PdfRenderData {
  return {
    business: {
      name: "Kigali Traders",
      tin: "123",
      address: "KG 7 Ave",
      phone: "+250788000000",
      email: "hi@kigali.rw",
      rraEbmNumber: "EBM-1",
      accentColor: "#C2185B",
      logoDataUri: null,
    },
    customer: { name: "Acme Ltd", tin: null, address: null, phone: null, email: null },
    typeLabel: "Invoice",
    number: "INV-0001",
    status: "FINALIZED",
    issueDate: "2026-08-18",
    dueDate: null,
    notes: null,
    lines: [
      {
        description: "Printing service",
        quantity: "3",
        unitPriceFormatted: "5,000 RWF",
        taxRateFormatted: "18%",
        lineTotalFormatted: "15,000 RWF",
      },
    ],
    subtotalFormatted: "15,000 RWF",
    taxTotalFormatted: "2,700 RWF",
    totalFormatted: "17,700 RWF",
    ...overrides,
  };
}

describe("renderMinimalHtml", () => {
  it("includes the business name, document type, and number", () => {
    const html = renderMinimalHtml(makeData());
    expect(html).toContain("Kigali Traders");
    expect(html).toContain("Invoice");
    expect(html).toContain("INV-0001");
  });

  it("shows DRAFT instead of a number when unfinalized", () => {
    const html = renderMinimalHtml(makeData({ number: null, status: "DRAFT" }));
    expect(html).toContain("DRAFT");
  });

  it("renders every line item and the totals", () => {
    const html = renderMinimalHtml(makeData());
    expect(html).toContain("Printing service");
    expect(html).toContain("5,000 RWF");
    expect(html).toContain("17,700 RWF");
  });

  it("omits the logo image when there is none", () => {
    const html = renderMinimalHtml(makeData({ business: { ...makeData().business, logoDataUri: null } }));
    expect(html).not.toContain("<img");
  });

  it("renders the logo image when present", () => {
    const html = renderMinimalHtml(
      makeData({ business: { ...makeData().business, logoDataUri: "data:image/png;base64,abc" } }),
    );
    expect(html).toContain('<img src="data:image/png;base64,abc"');
  });

  it("uses the business accent color for the header rule", () => {
    const html = renderMinimalHtml(makeData({ business: { ...makeData().business, accentColor: "#00FF00" } }));
    expect(html).toContain("#00FF00");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/lib/pdf/minimal-template.test.ts`
Expected: FAIL, `Cannot find module './minimal-template.js'`.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/pdf/minimal-template.ts`:

```ts
import { htmlDocumentShell } from "./html-shell.js";
import type { PdfRenderData } from "./render-data.js";

const STYLES = `
@page { size: A4; margin: 18mm; }
.logo { height: 14mm; margin-bottom: 4mm; }
.header { display: flex; justify-content: space-between; align-items: flex-start; }
.business-name { font-family: "Fraunces", serif; font-size: 18px; font-weight: 600; }
.doc-meta { text-align: right; }
.doc-type { font-family: "Fraunces", serif; font-size: 16px; font-weight: 600; }
.doc-number { color: #6b7280; margin-top: 2px; }
.rule { height: 2px; margin: 6mm 0 8mm; }
.parties { display: flex; justify-content: space-between; margin-bottom: 8mm; }
.party-label { color: #9ca3af; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; margin-bottom: 2mm; }
th { text-align: left; font-weight: 500; color: #6b7280; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; padding-bottom: 2mm; border-bottom: 1px solid #e5e7eb; }
td { padding: 3mm 0; border-bottom: 1px solid #f3f4f6; }
td.num, th.num { text-align: right; }
.totals { display: flex; justify-content: flex-end; margin-top: 6mm; }
.totals-box { width: 60mm; }
.totals-row { display: flex; justify-content: space-between; padding: 1mm 0; color: #4b5563; }
.totals-row.total { font-weight: 700; font-size: 13px; color: #111827; border-top: 1px solid #e5e7eb; margin-top: 2mm; padding-top: 2mm; }
.notes { margin-top: 10mm; color: #6b7280; font-size: 10px; }
`;

export function renderMinimalHtml(data: PdfRenderData): string {
  const linesHtml = data.lines
    .map(
      (line) => `<tr>
        <td>${line.description}</td>
        <td class="num">${line.quantity}</td>
        <td class="num">${line.unitPriceFormatted}</td>
        <td class="num">${line.taxRateFormatted}</td>
        <td class="num">${line.lineTotalFormatted}</td>
      </tr>`,
    )
    .join("");

  const body = `
    <div class="header">
      <div>
        ${data.business.logoDataUri ? `<img class="logo" src="${data.business.logoDataUri}" />` : ""}
        <div class="business-name">${data.business.name}</div>
      </div>
      <div class="doc-meta">
        <div class="doc-type">${data.typeLabel}</div>
        <div class="doc-number">${data.number ?? "DRAFT"}</div>
        <div class="doc-number">${data.issueDate}</div>
      </div>
    </div>
    <div class="rule" style="background:${data.business.accentColor}"></div>
    <div class="parties">
      <div>
        <div class="party-label">Bill to</div>
        <div>${data.customer.name}</div>
        ${data.customer.address ? `<div>${data.customer.address}</div>` : ""}
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num">Unit price</th>
          <th class="num">Tax</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${linesHtml}</tbody>
    </table>
    <div class="totals">
      <div class="totals-box">
        <div class="totals-row"><span>Subtotal</span><span>${data.subtotalFormatted}</span></div>
        <div class="totals-row"><span>Tax</span><span>${data.taxTotalFormatted}</span></div>
        <div class="totals-row total" style="color:${data.business.accentColor}"><span>Total</span><span>${data.totalFormatted}</span></div>
      </div>
    </div>
    ${data.notes ? `<div class="notes">${data.notes}</div>` : ""}
  `;

  return htmlDocumentShell(data.number ?? "Draft", STYLES, body);
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd server && npx vitest run src/lib/pdf/minimal-template.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/pdf/minimal-template.ts server/src/lib/pdf/minimal-template.test.ts
git commit -m "add MINIMAL PDF template"
```

---

### Task 10: FORMAL template

**Files:**
- Create: `server/src/lib/pdf/formal-template.ts`
- Test: `server/src/lib/pdf/formal-template.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/lib/pdf/formal-template.test.ts` (reuse the same `makeData` helper as Task 9's test, copied verbatim into this file so each test file stays independently runnable):

```ts
import { describe, expect, it } from "vitest";
import { renderFormalHtml } from "./formal-template.js";
import type { PdfRenderData } from "./render-data.js";

function makeData(overrides: Partial<PdfRenderData> = {}): PdfRenderData {
  return {
    business: {
      name: "Kigali Traders",
      tin: "123",
      address: "KG 7 Ave",
      phone: "+250788000000",
      email: "hi@kigali.rw",
      rraEbmNumber: "EBM-1",
      accentColor: "#C2185B",
      logoDataUri: null,
    },
    customer: { name: "Acme Ltd", tin: null, address: null, phone: null, email: null },
    typeLabel: "Invoice",
    number: "INV-0001",
    status: "FINALIZED",
    issueDate: "2026-08-18",
    dueDate: "2026-09-01",
    notes: null,
    lines: [
      {
        description: "Printing service",
        quantity: "3",
        unitPriceFormatted: "5,000 RWF",
        taxRateFormatted: "18%",
        lineTotalFormatted: "15,000 RWF",
      },
    ],
    subtotalFormatted: "15,000 RWF",
    taxTotalFormatted: "2,700 RWF",
    totalFormatted: "17,700 RWF",
    ...overrides,
  };
}

describe("renderFormalHtml", () => {
  it("includes the business and customer blocks in bordered boxes", () => {
    const html = renderFormalHtml(makeData());
    expect(html).toContain("Kigali Traders");
    expect(html).toContain("Acme Ltd");
    expect(html).toContain("border");
  });

  it("shows both issue date and due date when present", () => {
    const html = renderFormalHtml(makeData());
    expect(html).toContain("2026-08-18");
    expect(html).toContain("2026-09-01");
  });

  it("shows DRAFT instead of a number when unfinalized", () => {
    const html = renderFormalHtml(makeData({ number: null, status: "DRAFT" }));
    expect(html).toContain("DRAFT");
  });

  it("renders the line-item table with visible grid lines", () => {
    const html = renderFormalHtml(makeData());
    expect(html).toContain("Printing service");
    expect(html).toMatch(/border[^;]*;/);
  });

  it("uses the business accent color for the header strip", () => {
    const html = renderFormalHtml(makeData({ business: { ...makeData().business, accentColor: "#00FF00" } }));
    expect(html).toContain("#00FF00");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/lib/pdf/formal-template.test.ts`
Expected: FAIL, `Cannot find module './formal-template.js'`.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/pdf/formal-template.ts`:

```ts
import { htmlDocumentShell } from "./html-shell.js";
import type { PdfRenderData } from "./render-data.js";

const STYLES = `
@page { size: A4; margin: 18mm; }
.logo { height: 12mm; margin-bottom: 3mm; }
.letterhead { background: color-mix(in srgb, var(--accent) 12%, white); padding: 6mm; display: flex; justify-content: space-between; align-items: center; border-radius: 2mm; }
.business-name { font-family: "Fraunces", serif; font-size: 17px; font-weight: 700; }
.doc-title { font-family: "Fraunces", serif; font-size: 20px; font-weight: 700; text-align: right; text-transform: uppercase; letter-spacing: 0.05em; }
.meta-row { display: flex; gap: 6mm; margin: 8mm 0; }
.meta-box { flex: 1; border: 1px solid #d1d5db; border-radius: 2mm; padding: 4mm; }
.meta-box-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 2mm; font-weight: 600; }
th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; padding: 3mm; border: 1px solid #d1d5db; background: color-mix(in srgb, var(--accent) 10%, white); }
td { padding: 3mm; border: 1px solid #d1d5db; }
td.num, th.num { text-align: right; }
.totals { display: flex; justify-content: flex-end; margin-top: 6mm; }
.totals-box { width: 65mm; border: 1px solid #d1d5db; border-radius: 2mm; overflow: hidden; }
.totals-row { display: flex; justify-content: space-between; padding: 2mm 4mm; }
.totals-row.total { font-weight: 700; font-size: 13px; background: color-mix(in srgb, var(--accent) 15%, white); }
.notes { margin-top: 10mm; color: #6b7280; font-size: 10px; }
`;

export function renderFormalHtml(data: PdfRenderData): string {
  const linesHtml = data.lines
    .map(
      (line) => `<tr>
        <td>${line.description}</td>
        <td class="num">${line.quantity}</td>
        <td class="num">${line.unitPriceFormatted}</td>
        <td class="num">${line.taxRateFormatted}</td>
        <td class="num">${line.lineTotalFormatted}</td>
      </tr>`,
    )
    .join("");

  const body = `
    <div style="--accent:${data.business.accentColor}">
      <div class="letterhead">
        <div>
          ${data.business.logoDataUri ? `<img class="logo" src="${data.business.logoDataUri}" />` : ""}
          <div class="business-name">${data.business.name}</div>
          ${data.business.address ? `<div>${data.business.address}</div>` : ""}
        </div>
        <div class="doc-title">${data.typeLabel}</div>
      </div>
      <div class="meta-row">
        <div class="meta-box">
          <div class="meta-box-label">Bill to</div>
          <div>${data.customer.name}</div>
          ${data.customer.address ? `<div>${data.customer.address}</div>` : ""}
        </div>
        <div class="meta-box">
          <div class="meta-box-label">Document details</div>
          <div>No: ${data.number ?? "DRAFT"}</div>
          <div>Issued: ${data.issueDate}</div>
          ${data.dueDate ? `<div>Due: ${data.dueDate}</div>` : ""}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="num">Qty</th>
            <th class="num">Unit price</th>
            <th class="num">Tax</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>${linesHtml}</tbody>
      </table>
      <div class="totals">
        <div class="totals-box">
          <div class="totals-row"><span>Subtotal</span><span>${data.subtotalFormatted}</span></div>
          <div class="totals-row"><span>Tax</span><span>${data.taxTotalFormatted}</span></div>
          <div class="totals-row total"><span>Total</span><span>${data.totalFormatted}</span></div>
        </div>
      </div>
      ${data.notes ? `<div class="notes">${data.notes}</div>` : ""}
    </div>
  `;

  return htmlDocumentShell(data.number ?? "Draft", STYLES, body);
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd server && npx vitest run src/lib/pdf/formal-template.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/pdf/formal-template.ts server/src/lib/pdf/formal-template.test.ts
git commit -m "add FORMAL PDF template"
```

---

### Task 11: SIDEBAR_ACCENT template

**Files:**
- Create: `server/src/lib/pdf/sidebar-accent-template.ts`
- Test: `server/src/lib/pdf/sidebar-accent-template.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/lib/pdf/sidebar-accent-template.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderSidebarAccentHtml } from "./sidebar-accent-template.js";
import type { PdfRenderData } from "./render-data.js";

function makeData(overrides: Partial<PdfRenderData> = {}): PdfRenderData {
  return {
    business: {
      name: "Kigali Traders",
      tin: "123",
      address: "KG 7 Ave",
      phone: "+250788000000",
      email: "hi@kigali.rw",
      rraEbmNumber: "EBM-1",
      accentColor: "#C2185B",
      logoDataUri: null,
    },
    customer: { name: "Acme Ltd", tin: null, address: null, phone: null, email: null },
    typeLabel: "Invoice",
    number: "INV-0001",
    status: "FINALIZED",
    issueDate: "2026-08-18",
    dueDate: null,
    notes: null,
    lines: [
      {
        description: "Printing service",
        quantity: "3",
        unitPriceFormatted: "5,000 RWF",
        taxRateFormatted: "18%",
        lineTotalFormatted: "15,000 RWF",
      },
    ],
    subtotalFormatted: "15,000 RWF",
    taxTotalFormatted: "2,700 RWF",
    totalFormatted: "17,700 RWF",
    ...overrides,
  };
}

describe("renderSidebarAccentHtml", () => {
  it("puts the business contact block and document meta in the sidebar", () => {
    const html = renderSidebarAccentHtml(makeData());
    expect(html).toContain("Kigali Traders");
    expect(html).toContain("EBM-1");
    expect(html).toContain("INV-0001");
  });

  it("renders the customer and line items in the main area", () => {
    const html = renderSidebarAccentHtml(makeData());
    expect(html).toContain("Acme Ltd");
    expect(html).toContain("Printing service");
    expect(html).toContain("17,700 RWF");
  });

  it("shows DRAFT instead of a number when unfinalized", () => {
    const html = renderSidebarAccentHtml(makeData({ number: null, status: "DRAFT" }));
    expect(html).toContain("DRAFT");
  });

  it("picks white sidebar text for a dark accent color", () => {
    const html = renderSidebarAccentHtml(makeData({ business: { ...makeData().business, accentColor: "#111111" } }));
    expect(html).toContain("#FFFFFF");
  });

  it("picks dark sidebar text for a light accent color", () => {
    const html = renderSidebarAccentHtml(makeData({ business: { ...makeData().business, accentColor: "#F5F5F5" } }));
    expect(html).toContain("#1F2937");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/lib/pdf/sidebar-accent-template.test.ts`
Expected: FAIL, `Cannot find module './sidebar-accent-template.js'`.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/pdf/sidebar-accent-template.ts`:

```ts
import { contrastRatio } from "../color.js";
import { htmlDocumentShell } from "./html-shell.js";
import type { PdfRenderData } from "./render-data.js";

function pickSidebarTextColor(accentColor: string): string {
  const whiteContrast = contrastRatio(accentColor, "#FFFFFF");
  const darkContrast = contrastRatio(accentColor, "#1F2937");
  return whiteContrast >= darkContrast ? "#FFFFFF" : "#1F2937";
}

const STYLES = `
@page { size: A4; margin: 0; }
body { display: flex; min-height: 297mm; }
.sidebar { width: 28%; padding: 16mm 8mm; position: fixed; top: 0; bottom: 0; left: 0; }
.main { width: 72%; margin-left: 28%; padding: 16mm; }
.logo { height: 12mm; margin-bottom: 6mm; }
.sidebar-name { font-family: "Fraunces", serif; font-size: 15px; font-weight: 700; margin-bottom: 8mm; }
.sidebar-section { margin-bottom: 8mm; }
.sidebar-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; margin-bottom: 2mm; }
.doc-title { font-family: "Fraunces", serif; font-size: 18px; font-weight: 700; margin-bottom: 8mm; }
.party-label { color: #9ca3af; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; margin-bottom: 2mm; }
th { text-align: left; font-weight: 500; color: #6b7280; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; padding-bottom: 2mm; border-bottom: 1px solid #e5e7eb; }
td { padding: 3mm 0; border-bottom: 1px solid #f3f4f6; }
td.num, th.num { text-align: right; }
.totals { display: flex; justify-content: flex-end; margin-top: 6mm; }
.totals-box { width: 60mm; }
.totals-row { display: flex; justify-content: space-between; padding: 1mm 0; color: #4b5563; }
.totals-row.total { font-weight: 700; font-size: 13px; color: #111827; border-top: 1px solid #e5e7eb; margin-top: 2mm; padding-top: 2mm; }
.notes { margin-top: 10mm; color: #6b7280; font-size: 10px; }
`;

export function renderSidebarAccentHtml(data: PdfRenderData): string {
  const textColor = pickSidebarTextColor(data.business.accentColor);

  const linesHtml = data.lines
    .map(
      (line) => `<tr>
        <td>${line.description}</td>
        <td class="num">${line.quantity}</td>
        <td class="num">${line.unitPriceFormatted}</td>
        <td class="num">${line.taxRateFormatted}</td>
        <td class="num">${line.lineTotalFormatted}</td>
      </tr>`,
    )
    .join("");

  const body = `
    <div class="sidebar" style="background:${data.business.accentColor}; color:${textColor}">
      ${data.business.logoDataUri ? `<img class="logo" src="${data.business.logoDataUri}" />` : ""}
      <div class="sidebar-name">${data.business.name}</div>
      <div class="sidebar-section">
        <div class="sidebar-label">Contact</div>
        ${data.business.address ? `<div>${data.business.address}</div>` : ""}
        ${data.business.phone ? `<div>${data.business.phone}</div>` : ""}
        ${data.business.email ? `<div>${data.business.email}</div>` : ""}
        ${data.business.tin ? `<div>TIN ${data.business.tin}</div>` : ""}
        ${data.business.rraEbmNumber ? `<div>${data.business.rraEbmNumber}</div>` : ""}
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">${data.typeLabel}</div>
        <div>${data.number ?? "DRAFT"}</div>
        <div>${data.issueDate}</div>
        ${data.dueDate ? `<div>Due ${data.dueDate}</div>` : ""}
        <div>${data.status}</div>
      </div>
    </div>
    <div class="main">
      <div class="doc-title">${data.typeLabel}</div>
      <div class="party-label">Bill to</div>
      <div>${data.customer.name}</div>
      ${data.customer.address ? `<div>${data.customer.address}</div>` : ""}
      <table style="margin-top:8mm">
        <thead>
          <tr>
            <th>Description</th>
            <th class="num">Qty</th>
            <th class="num">Unit price</th>
            <th class="num">Tax</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>${linesHtml}</tbody>
      </table>
      <div class="totals">
        <div class="totals-box">
          <div class="totals-row"><span>Subtotal</span><span>${data.subtotalFormatted}</span></div>
          <div class="totals-row"><span>Tax</span><span>${data.taxTotalFormatted}</span></div>
          <div class="totals-row total"><span>Total</span><span>${data.totalFormatted}</span></div>
        </div>
      </div>
      ${data.notes ? `<div class="notes">${data.notes}</div>` : ""}
    </div>
  `;

  return htmlDocumentShell(data.number ?? "Draft", STYLES, body);
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd server && npx vitest run src/lib/pdf/sidebar-accent-template.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/pdf/sidebar-accent-template.ts server/src/lib/pdf/sidebar-accent-template.test.ts
git commit -m "add SIDEBAR_ACCENT PDF template"
```

---

### Task 12: `renderDocumentPdf` dispatcher

**Files:**
- Create: `server/src/lib/pdf/render-document-pdf.ts`
- Test: `server/src/lib/pdf/render-document-pdf.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/lib/pdf/render-document-pdf.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderDocumentToHtml } from "./render-document-pdf.js";
import type { PdfRenderData } from "./render-data.js";

function makeData(overrides: Partial<PdfRenderData> = {}): PdfRenderData {
  return {
    business: {
      name: "Kigali Traders",
      tin: null,
      address: null,
      phone: null,
      email: null,
      rraEbmNumber: null,
      accentColor: "#C2185B",
      logoDataUri: null,
    },
    customer: { name: "Acme Ltd", tin: null, address: null, phone: null, email: null },
    typeLabel: "Invoice",
    number: "INV-0001",
    status: "FINALIZED",
    issueDate: "2026-08-18",
    dueDate: null,
    notes: null,
    lines: [],
    subtotalFormatted: "0 RWF",
    taxTotalFormatted: "0 RWF",
    totalFormatted: "0 RWF",
    ...overrides,
  };
}

describe("renderDocumentToHtml", () => {
  it("dispatches to the minimal template", () => {
    const html = renderDocumentToHtml("MINIMAL", makeData());
    expect(html).toContain("Kigali Traders");
  });

  it("dispatches to the formal template", () => {
    const html = renderDocumentToHtml("FORMAL", makeData());
    expect(html).toContain("letterhead");
  });

  it("dispatches to the sidebar accent template", () => {
    const html = renderDocumentToHtml("SIDEBAR_ACCENT", makeData());
    expect(html).toContain("sidebar");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/lib/pdf/render-document-pdf.test.ts`
Expected: FAIL, `Cannot find module './render-document-pdf.js'`.

- [ ] **Step 3: Write the implementation**

Create `server/src/lib/pdf/render-document-pdf.ts`:

```ts
import type { DocumentTemplate } from "@prisma/client";
import { renderMinimalHtml } from "./minimal-template.js";
import { renderFormalHtml } from "./formal-template.js";
import { renderSidebarAccentHtml } from "./sidebar-accent-template.js";
import { renderHtmlToPdfBuffer } from "./browser.js";
import type { PdfRenderData } from "./render-data.js";

export function renderDocumentToHtml(template: DocumentTemplate, data: PdfRenderData): string {
  switch (template) {
    case "MINIMAL":
      return renderMinimalHtml(data);
    case "FORMAL":
      return renderFormalHtml(data);
    case "SIDEBAR_ACCENT":
      return renderSidebarAccentHtml(data);
  }
}

export async function renderDocumentPdf(template: DocumentTemplate, data: PdfRenderData): Promise<Buffer> {
  const html = renderDocumentToHtml(template, data);
  return renderHtmlToPdfBuffer(html);
}
```

Note: this imports `./browser.js`, which doesn't exist yet. That's fine, the test above only exercises `renderDocumentToHtml` (the synchronous half), so it doesn't need `browser.js` to exist and pass. `renderDocumentPdf` (the async half using it) gets covered indirectly once Task 13 exists and Task 14's route test mocks this whole module.

- [ ] **Step 4: This step is expected to fail until Task 13. Skip running the full file test now**

Since `render-document-pdf.ts` imports `./browser.js` (created in Task 13), TypeScript/the module loader will fail until that file exists. Create a placeholder immediately so this task's test can actually run in isolation:

Create `server/src/lib/pdf/browser.ts` with just enough to satisfy the import (Task 13 replaces this with the real implementation and its own tests):

```ts
export async function renderHtmlToPdfBuffer(_html: string): Promise<Buffer> {
  throw new Error("not implemented yet");
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `cd server && npx vitest run src/lib/pdf/render-document-pdf.test.ts`
Expected: PASS, 3 tests (all three only exercise `renderDocumentToHtml`, which doesn't call the placeholder).

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/pdf/render-document-pdf.ts server/src/lib/pdf/render-document-pdf.test.ts server/src/lib/pdf/browser.ts
git commit -m "add template dispatcher for PDF rendering"
```

---

### Task 13: Puppeteer wrapper

**Files:**
- Modify: `server/src/lib/pdf/browser.ts` (replacing Task 12's placeholder)
- Test: `server/src/lib/pdf/browser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/pdf/browser.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { renderHtmlToPdfBuffer, closeBrowser } from "./browser.js";

describe("renderHtmlToPdfBuffer", () => {
  afterAll(async () => {
    await closeBrowser();
  });

  it(
    "renders HTML to a real PDF buffer",
    async () => {
      const buffer = await renderHtmlToPdfBuffer("<html><body><h1>hello</h1></body></html>");
      expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
    },
    15000,
  );
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/lib/pdf/browser.test.ts`
Expected: FAIL, the placeholder throws `not implemented yet`.

- [ ] **Step 3: Write the real implementation**

Replace `server/src/lib/pdf/browser.ts`:

```ts
import puppeteer, { type Browser } from "puppeteer";

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ headless: true });
  }
  return browserPromise;
}

export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    page.setDefaultTimeout(10000);
    await page.setContent(html, { waitUntil: "load" });
    const pdfBytes = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdfBytes);
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd server && npx vitest run src/lib/pdf/browser.test.ts`
Expected: PASS, 1 test (may take a few seconds for Chromium to launch).

- [ ] **Step 5: Re-run Task 12's test to confirm the dispatcher's async half still behaves**

Run: `cd server && npx vitest run src/lib/pdf/render-document-pdf.test.ts src/lib/pdf/browser.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/pdf/browser.ts server/src/lib/pdf/browser.test.ts
git commit -m "render PDFs with a warm, reused headless Chromium instance"
```

---

### Task 14: `GET /documents/:id/pdf` route

**Files:**
- Modify: `server/src/routes/documents.ts`
- Test: `server/src/routes/documents.pdf.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/routes/documents.pdf.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";
import * as renderDocumentPdfModule from "../lib/pdf/render-document-pdf.js";

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
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
  return res.body.customer.id as string;
}

describe("GET /documents/:id/pdf", () => {
  beforeEach(() => {
    vi.spyOn(renderDocumentPdfModule, "renderDocumentPdf").mockResolvedValue(Buffer.from("%PDF-fake"));
  });

  it("streams a PDF with a draft filename for an unfinalized document", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "INVOICE", customerId, issueDate: "2026-08-18", lines: [] });

    const res = await request(app).get(`/documents/${created.body.document.id}/pdf`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain(
      `Draft-${created.body.document.id.slice(0, 8)}.pdf`,
    );
  });

  it("streams a PDF with the invoice number as the filename once finalized", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId,
        issueDate: "2026-08-18",
        lines: [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }],
      });
    await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);

    const res = await request(app).get(`/documents/${created.body.document.id}/pdf`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("INV-0001.pdf");
  });

  it("returns 404 for a document belonging to another business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "INVOICE", customerId, issueDate: "2026-08-18", lines: [] });

    const otherCookies = await request(app).post("/auth/register").send({
      email: "other@example.com",
      password: "Supersecret1!",
      businessName: "Other Biz",
    });

    const res = await request(app)
      .get(`/documents/${created.body.document.id}/pdf`)
      .set("Cookie", otherCookies.headers["set-cookie"] as unknown as string[]);

    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).get("/documents/some-id/pdf");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run src/routes/documents.pdf.test.ts`
Expected: FAIL, 404 for all routes (the route doesn't exist yet).

- [ ] **Step 3: Add the route**

In `server/src/routes/documents.ts`, add the import at the top:

```ts
import { buildPdfRenderData } from "../lib/pdf/render-data.js";
import { renderDocumentPdf } from "../lib/pdf/render-document-pdf.js";
```

Then add the new route (after the existing `GET /:id` route, before `PATCH /:id`):

```ts
documentsRouter.get("/:id/pdf", async (req, res) => {
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

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  const data = await buildPdfRenderData(document, business!);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderDocumentPdf(document.template, data);
  } catch {
    res.status(500).json({ error: "pdf_render_failed" });
    return;
  }

  const filename = document.number ? `${document.number}.pdf` : `Draft-${document.id.slice(0, 8)}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(pdfBuffer);
});
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd server && npx vitest run src/routes/documents.pdf.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the full server suite to make sure nothing else broke**

Run: `cd server && npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/documents.ts server/src/routes/documents.pdf.test.ts
git commit -m "add GET /documents/:id/pdf route"
```

---

### Task 15: Business Settings page

**Files:**
- Create: `client/src/pages/BusinessSettings.tsx`
- Test: `client/src/pages/BusinessSettings.test.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/AppLayout.tsx`

- [ ] **Step 1: Write the failing tests**

Create `client/src/pages/BusinessSettings.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import BusinessSettings from "./BusinessSettings";

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <AuthProvider>
        <BusinessSettings />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("BusinessSettings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads and shows the current business profile and template", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/business") || url.endsWith("/auth/me")) {
        return new Response(
          JSON.stringify({
            business: {
              name: "Kigali Traders",
              tin: "123",
              industry: null,
              phone: null,
              email: null,
              address: null,
              rraEbmNumber: null,
              defaultTemplate: "FORMAL",
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 401 });
    });

    renderPage();

    expect(await screen.findByDisplayValue("Kigali Traders")).toBeInTheDocument();
    expect(await screen.findByLabelText("Formal")).toBeChecked();
  });

  it("submits changed fields and the selected template", async () => {
    let patchBody: unknown = null;
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.endsWith("/business") && init?.method === "PATCH") {
        patchBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ business: {} }), { status: 200 });
      }
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
      return new Response("{}", { status: 401 });
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByDisplayValue("Kigali Traders");
    await user.click(screen.getByLabelText("Sidebar accent"));
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(patchBody).toMatchObject({ defaultTemplate: "SIDEBAR_ACCENT" }));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/BusinessSettings.test.tsx`
Expected: FAIL, `Failed to resolve import "./BusinessSettings"`.

- [ ] **Step 3: Write the implementation**

Create `client/src/pages/BusinessSettings.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { DocumentTemplate } from "@billa/shared";
import { AppLayout } from "../components/AppLayout";
import { FormField } from "../components/FormField";
import { Button } from "../components/Button";
import { apiRequest, ApiError } from "../lib/apiClient";

interface BusinessProfile {
  name: string;
  tin: string | null;
  industry: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  rraEbmNumber: string | null;
  defaultTemplate: DocumentTemplate;
}

const TEMPLATE_OPTIONS: { value: DocumentTemplate; label: string; description: string }[] = [
  { value: "MINIMAL", label: "Minimal", description: "Quiet, a lot of white space." },
  { value: "FORMAL", label: "Formal", description: "The traditional printed-invoice feel." },
  { value: "SIDEBAR_ACCENT", label: "Sidebar accent", description: "A bold colored sidebar carries your branding." },
];

const TEXT_FIELDS: { id: keyof BusinessProfile; label: string; type: "text" | "tel" | "email" }[] = [
  { id: "name", label: "Business name", type: "text" },
  { id: "tin", label: "TIN", type: "text" },
  { id: "industry", label: "Industry", type: "text" },
  { id: "phone", label: "Phone", type: "tel" },
  { id: "email", label: "Business email", type: "email" },
  { id: "address", label: "Address", type: "text" },
  { id: "rraEbmNumber", label: "RRA EBM number", type: "text" },
];

export default function BusinessSettings() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    apiRequest<{ business: BusinessProfile }>("/business").then((data) => setProfile(data.business));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setApiError(null);
    setIsSaving(true);
    try {
      const payload: Record<string, string> = { defaultTemplate: profile.defaultTemplate };
      for (const field of TEXT_FIELDS) {
        const value = profile[field.id];
        if (typeof value === "string" && value.trim().length > 0) {
          payload[field.id] = value.trim();
        }
      }
      await apiRequest("/business", { method: "PATCH", body: payload });
    } catch (err) {
      setApiError(err instanceof ApiError ? "Couldn't save your settings. Try again." : "Something went wrong. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!profile) {
    return (
      <AppLayout>
        <p className="font-sans text-sm text-neutral-600">Loading…</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold text-neutral-900">Business settings</h1>

        {apiError && (
          <div className="rounded-lg bg-error-bg px-4 py-3 font-sans text-sm text-error" role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {TEXT_FIELDS.map((field) => (
            <FormField
              key={field.id}
              id={field.id}
              label={field.label}
              type={field.type}
              value={profile[field.id] ?? ""}
              onChange={(e) => setProfile({ ...profile, [field.id]: e.target.value })}
            />
          ))}

          <div className="flex flex-col gap-3">
            <span className="font-sans text-sm font-medium text-neutral-800">Document template</span>
            {TEMPLATE_OPTIONS.map((option) => (
              <label
                key={option.value}
                htmlFor={`template-${option.value}`}
                className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3.5"
              >
                <input
                  type="radio"
                  id={`template-${option.value}`}
                  name="defaultTemplate"
                  value={option.value}
                  checked={profile.defaultTemplate === option.value}
                  onChange={() => setProfile({ ...profile, defaultTemplate: option.value })}
                  className="mt-1"
                />
                <span>
                  <span className="block font-sans text-sm font-medium text-neutral-900">{option.label}</span>
                  <span className="block font-sans text-sm text-neutral-500">{option.description}</span>
                </span>
              </label>
            ))}
          </div>

          <Button type="submit" isLoading={isSaving}>
            Save
          </Button>
        </form>
      </div>
    </AppLayout>
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd client && npx vitest run src/pages/BusinessSettings.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Wire up the route and nav link**

In `client/src/App.tsx`, add the import:

```ts
import BusinessSettings from "./pages/BusinessSettings";
```

And add the route inside the `<Route element={<ProtectedRoute />}>` block, alongside the other protected routes:

```tsx
<Route path="/settings" element={<BusinessSettings />} />
```

In `client/src/components/AppLayout.tsx`, add a nav link after the "Items" link:

```tsx
<Link to="/settings" className="font-sans text-sm font-medium text-neutral-600 hover:text-neutral-900">
  Settings
</Link>
```

- [ ] **Step 6: Run the client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/BusinessSettings.tsx client/src/pages/BusinessSettings.test.tsx client/src/App.tsx client/src/components/AppLayout.tsx
git commit -m "add business settings page with template picker"
```

---

### Task 16: "Download PDF" on the document form and view

**Files:**
- Modify: `client/src/pages/DocumentForm.tsx`
- Modify: `client/src/pages/DocumentForm.test.tsx`
- Modify: `client/src/pages/DocumentView.tsx`
- Modify: `client/src/pages/DocumentView.test.tsx`

- [ ] **Step 1: Write the failing test for DocumentView**

In `client/src/pages/DocumentView.test.tsx`, add to the existing `describe` block:

```tsx
it("opens the PDF download URL when the button is clicked", async () => {
  vi.spyOn(global, "fetch").mockImplementation(async () =>
    new Response(
      JSON.stringify({
        document: {
          id: "d1",
          number: "INV-0001",
          status: "FINALIZED",
          customer: { name: "Kigali Traders" },
          lines: [],
          subtotal: 0,
          taxTotal: 0,
          total: 0,
        },
      }),
      { status: 200 },
    ),
  );
  const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
  const user = userEvent.setup();

  render(
    <MemoryRouter initialEntries={["/documents/d1"]}>
      <AuthProvider>
        <Routes>
          <Route path="/documents/:id" element={<DocumentView />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

  await user.click(await screen.findByRole("button", { name: /download pdf/i }));

  expect(openSpy).toHaveBeenCalledWith(expect.stringContaining("/documents/d1/pdf"), "_blank");
});
```

Add the needed imports at the top of the file if not already present: `userEvent` from `@testing-library/user-event`.

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/DocumentView.test.tsx`
Expected: FAIL, no button with name "download pdf".

- [ ] **Step 3: Add the button to DocumentView**

In `client/src/pages/DocumentView.tsx`, add the import:

```ts
import { API_BASE_URL } from "../lib/apiClient";
```

Add a handler and button inside the header `div` (next to the status span):

```tsx
<div className="flex items-center gap-4">
  <span className="font-sans text-sm text-neutral-500">{document.status}</span>
  <button
    type="button"
    onClick={() => window.open(`${API_BASE_URL}/documents/${document.id}/pdf`, "_blank")}
    className="rounded-lg border border-neutral-200 px-4 py-2 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
  >
    Download PDF
  </button>
</div>
```

Replace the existing `<span className="font-sans text-sm text-neutral-500">{document.status}</span>` line with this block (it now wraps that same span plus the new button).

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd client && npx vitest run src/pages/DocumentView.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the failing test for DocumentForm**

In `client/src/pages/DocumentForm.test.tsx`, add a new test using the same mock setup as the existing `"finalizes a document..."` test (loads document `d1`), but asserting on the download button instead:

```tsx
it("opens the PDF download URL for an existing draft", async () => {
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
            lines: [],
          },
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 401 });
  });
  const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
  const user = userEvent.setup();

  renderEdit("d1");

  await user.click(await screen.findByRole("button", { name: /download pdf/i }));

  expect(openSpy).toHaveBeenCalledWith(expect.stringContaining("/documents/d1/pdf"), "_blank");
});
```

- [ ] **Step 6: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/DocumentForm.test.tsx`
Expected: FAIL, no button with name "download pdf".

- [ ] **Step 7: Add the button to DocumentForm**

In `client/src/pages/DocumentForm.tsx`, add the import:

```ts
import { API_BASE_URL } from "../lib/apiClient";
```

In the actions row (where "Save draft" and "Finalize" live), add the download button, only when editing an existing document (a brand-new unsaved draft has no `id` to download yet):

```tsx
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
      onClick={() => window.open(`${API_BASE_URL}/documents/${id}/pdf`, "_blank")}
      className="flex items-center justify-center rounded-lg border border-neutral-200 px-6 py-2.5 font-sans text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
    >
      Download PDF
    </button>
  )}
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
```

This replaces the existing `<div className="flex gap-3">...</div>` actions block in the form (the "Save draft" and "Finalize" buttons keep their exact existing `className` values as shown above; only the new "Download PDF" button in the middle is new).

- [ ] **Step 8: Run the test to confirm it passes**

Run: `cd client && npx vitest run src/pages/DocumentForm.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 9: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add client/src/pages/DocumentForm.tsx client/src/pages/DocumentForm.test.tsx client/src/pages/DocumentView.tsx client/src/pages/DocumentView.test.tsx
git commit -m "add Download PDF button to the document form and view"
```

---

### Task 17: "Download PDF" inline in the documents list

**Files:**
- Modify: `client/src/pages/Documents.tsx`
- Modify: `client/src/pages/Documents.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to the existing `describe("Documents"` block in `client/src/pages/Documents.test.tsx` (mirroring however the existing tests mock the list fetch and render one row):

```tsx
it("opens the PDF download URL when the row's download button is clicked", async () => {
  vi.spyOn(global, "fetch").mockImplementation(async () =>
    new Response(
      JSON.stringify({
        results: [
          {
            id: "d1",
            number: "INV-0001",
            status: "FINALIZED",
            issueDate: "2026-08-18T00:00:00.000Z",
            total: 5000,
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
  const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
  const user = userEvent.setup();

  render(
    <MemoryRouter initialEntries={["/documents?type=INVOICE"]}>
      <AuthProvider>
        <Documents />
      </AuthProvider>
    </MemoryRouter>,
  );

  await user.click(await screen.findByRole("button", { name: /download/i }));

  expect(openSpy).toHaveBeenCalledWith(expect.stringContaining("/documents/d1/pdf"), "_blank");
});
```

Check the top of the existing test file for how it already imports `render`, `screen`, `userEvent`, `MemoryRouter`, `AuthProvider`, and `Documents`, and reuse those same imports (add `userEvent` if the file doesn't already import it).

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd client && npx vitest run src/pages/Documents.test.tsx`
Expected: FAIL, no button with name "download".

- [ ] **Step 3: Add the inline download button**

In `client/src/pages/Documents.tsx`, add the import:

```ts
import { API_BASE_URL } from "../lib/apiClient";
```

Add a new column. In the `<thead>`, add an empty header cell after "Status":

```tsx
<th className="py-2" />
```

In the `<tbody>` row, add a cell with the download button. Since the row itself has an `onClick` that navigates, stop propagation on the button's click so downloading doesn't also trigger navigation:

```tsx
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
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd client && npx vitest run src/pages/Documents.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the full client suite and typecheck**

Run: `cd client && npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Documents.tsx client/src/pages/Documents.test.tsx
git commit -m "add inline Download PDF action to the documents list"
```

---

### Task 18: Full suite, typecheck, and real-browser verification

**Files:** none (verification only)

- [ ] **Step 1: Run every workspace's test suite**

Run: `cd shared && npm test && cd ../server && npm test && cd ../client && npm test`
Expected: all pass (shared, server, and client, including the new PDF tests).

- [ ] **Step 2: Typecheck every workspace**

Run: `cd shared && npm run typecheck && cd ../server && npm run typecheck && cd ../client && npm run typecheck`
Expected: no errors in any workspace.

- [ ] **Step 3: Real-browser verification**

Start both the API server (`npm run dev` in `server/`) and the client dev server, then in the browser:

1. Log in to the test account already used for the Document Engine stage's verification (or register a fresh one).
2. Go to Settings, confirm the current template is selected, switch to each of the three templates in turn and save, confirming the PATCH succeeds and the selection persists on reload.
3. Set the template to MINIMAL. Open an existing draft invoice, click "Download PDF", confirm a real PDF downloads/opens showing "DRAFT" where the number would go, with the business name, customer, line items, and totals all correct.
4. Open a finalized invoice's read-only view, click "Download PDF", confirm the PDF shows the real invoice number and looks right.
5. Switch the business's default template to FORMAL, create and finalize a new invoice, download its PDF, confirm it uses the FORMAL layout (bordered boxes, filled table header).
6. Switch to SIDEBAR_ACCENT, create and finalize another invoice, download its PDF, confirm the colored sidebar renders with legible text (check the accent color's contrast makes sense) and the logo (if one is set on the test business) appears in the sidebar.
7. From the Invoices list, click the inline "Download" action on a row and confirm it downloads without navigating to the document.
8. Check the browser's console and network tab for unexpected errors during all of the above.

- [ ] **Step 4: Fix any issues found**

If real-browser verification finds bugs, fix them, add or update the relevant test(s) to cover what was missed, re-run that test file to confirm it passes, then commit the fix as its own commit (not folded into an earlier task's commit).

- [ ] **Step 5: Final confirmation**

Once every workspace's suite passes, every workspace typechecks, and manual verification found no outstanding issues, this stage is done.

---

## Self-review notes

- **Spec coverage:** rendering pipeline (Tasks 4-13), route (Task 14), all three templates (Tasks 9-11), business settings page + template picker (Task 15), both client entry points (Tasks 16-17), shared money formatter move (Task 2), `defaultTemplate` schema field (Task 3), error handling for a render failure (Task 14 Step 3's try/catch), logo/font self-containment (Tasks 4 and 6), tenant scoping and draft-vs-finalized filenames (Task 14's tests). All spec sections have a task.
- **Placeholder scan:** no TBD/TODO; Task 12's note about the temporary `browser.ts` placeholder is intentional sequencing (explained and immediately resolved in Task 13), not an unresolved placeholder.
- **Type consistency:** `PdfRenderData` (Task 7) is the single shape every template function (Tasks 9-11), the dispatcher (Task 12), and the route (Task 14) all consume identically; `DocumentTemplate` comes from `@prisma/client` consistently in Tasks 12 and 14.
