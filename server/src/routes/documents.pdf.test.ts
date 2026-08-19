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
