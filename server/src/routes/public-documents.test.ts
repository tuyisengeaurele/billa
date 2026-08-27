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
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[]) {
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
  return res.body.customer.id as string;
}

async function createFinalizedDocument(app: ReturnType<typeof createApp>, cookies: string[]) {
  const customerId = await createCustomer(app, cookies);
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-24",
      lines: [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }],
    });
  await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);
  const res = await request(app).get(`/documents/${created.body.document.id}`).set("Cookie", cookies);
  return res.body.document as { id: string; publicToken: string };
}

async function createDraftDocument(app: ReturnType<typeof createApp>, cookies: string[]) {
  const customerId = await createCustomer(app, cookies);
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({ type: "INVOICE", customerId, issueDate: "2026-08-24", lines: [] });
  return created.body.document as { id: string; publicToken: string };
}

describe("GET /public/documents/:token", () => {
  it("returns a finalized document with business and customer info, no auth required", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const document = await createFinalizedDocument(app, cookies);

    const res = await request(app).get(`/public/documents/${document.publicToken}`);

    expect(res.status).toBe(200);
    expect(res.body.document.number).toBe("INV-0001");
    expect(res.body.document.business.name).toBe("Kigali Traders");
    expect(res.body.document.customer.name).toBe("Acme Ltd");
    expect(res.body.document.lines).toHaveLength(1);
    expect(res.body.document.accepted).toBe(false);
  });

  it("returns 404 for an unknown token", async () => {
    const res = await request(createApp()).get("/public/documents/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("returns 404 for a draft document's token (not shareable until finalized)", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const document = await createDraftDocument(app, cookies);

    const res = await request(app).get(`/public/documents/${document.publicToken}`);
    expect(res.status).toBe(404);
  });
});

describe("GET /public/documents/:token/pdf", () => {
  beforeEach(() => {
    vi.spyOn(renderDocumentPdfModule, "renderDocumentPdf").mockResolvedValue(Buffer.from("%PDF-fake"));
  });

  it("streams the PDF for a finalized document, no auth required", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const document = await createFinalizedDocument(app, cookies);

    const res = await request(app).get(`/public/documents/${document.publicToken}/pdf`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain("INV-0001.pdf");
  });

  it("returns 404 for a draft document's token", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const document = await createDraftDocument(app, cookies);

    const res = await request(app).get(`/public/documents/${document.publicToken}/pdf`);
    expect(res.status).toBe(404);
  });
});

async function createFinalizedProforma(app: ReturnType<typeof createApp>, cookies: string[]) {
  const customerId = await createCustomer(app, cookies);
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "PROFORMA",
      customerId,
      issueDate: "2026-08-24",
      lines: [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }],
    });
  await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);
  const res = await request(app).get(`/documents/${created.body.document.id}`).set("Cookie", cookies);
  return res.body.document as { id: string; publicToken: string };
}

describe("POST /public/documents/:token/accept", () => {
  it("converts a finalized proforma to a draft invoice, no auth required", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const proforma = await createFinalizedProforma(app, cookies);

    const res = await request(app).post(`/public/documents/${proforma.publicToken}/accept`);

    expect(res.status).toBe(201);
    expect(res.body.accepted).toBe(true);

    const proformaAfter = await request(app).get(`/documents/${proforma.id}`).set("Cookie", cookies);
    expect(proformaAfter.body.document.convertedTo).not.toBeNull();

    const publicView = await request(app).get(`/public/documents/${proforma.publicToken}`);
    expect(publicView.body.document.accepted).toBe(true);
  });

  it("returns 409 when accepted twice", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const proforma = await createFinalizedProforma(app, cookies);
    await request(app).post(`/public/documents/${proforma.publicToken}/accept`);

    const res = await request(app).post(`/public/documents/${proforma.publicToken}/accept`);
    expect(res.status).toBe(409);
  });

  it("returns 400 for a token belonging to a non-proforma document", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const document = await createFinalizedDocument(app, cookies);

    const res = await request(app).post(`/public/documents/${document.publicToken}/accept`);
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown token", async () => {
    const res = await request(createApp()).post("/public/documents/nonexistent-token/accept");
    expect(res.status).toBe(404);
  });
});
