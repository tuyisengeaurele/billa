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
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  return res.headers["set-cookie"] as unknown as string[];
}

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[]) {
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Musanze Supplies" });
  return res.body.customer.id as string;
}

async function createFinalizedInvoice(app: ReturnType<typeof createApp>, cookies: string[], customerId: string) {
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-19",
      lines: [{ description: "Cement", quantity: 5, unitPrice: 13000, taxRate: 18 }],
    });
  const finalized = await request(app)
    .post(`/documents/${created.body.document.id}/finalize`)
    .set("Cookie", cookies);
  return finalized.body.document as { id: string; number: string };
}

describe("referencedDocumentId on delivery notes and receipts", () => {
  it("allows a delivery note to reference a finalized invoice", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createFinalizedInvoice(app, cookies, customerId);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "DELIVERY_NOTE",
        customerId,
        issueDate: "2026-08-20",
        lines: [{ description: "Cement", quantity: 5, unitPrice: 13000, taxRate: 18 }],
        referencedDocumentId: invoice.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.document.referencedDocument.id).toBe(invoice.id);
    expect(res.body.document.referencedDocument.number).toBe(invoice.number);
  });

  it("allows a delivery note with no referencedDocumentId", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "DELIVERY_NOTE", customerId, issueDate: "2026-08-20", lines: [] });

    expect(res.status).toBe(201);
    expect(res.body.document.referencedDocument).toBeNull();
  });

  it("requires a referencedDocumentId for a receipt", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "RECEIPT", customerId, issueDate: "2026-08-20", lines: [] });

    expect(res.status).toBe(400);
  });

  it("allows a receipt that references a finalized invoice", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createFinalizedInvoice(app, cookies, customerId);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "RECEIPT",
        customerId,
        issueDate: "2026-08-20",
        lines: [{ description: `Payment for ${invoice.number}`, quantity: 1, unitPrice: 76700, taxRate: 0 }],
        referencedDocumentId: invoice.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.document.referencedDocument.id).toBe(invoice.id);
  });

  it("rejects referencing a document that isn't an invoice", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const proforma = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "PROFORMA", customerId, issueDate: "2026-08-19", lines: [] });
    await request(app).post(`/documents/${proforma.body.document.id}/finalize`).set("Cookie", cookies);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "DELIVERY_NOTE",
        customerId,
        issueDate: "2026-08-20",
        lines: [],
        referencedDocumentId: proforma.body.document.id,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("referenced_document_not_an_invoice");
  });

  it("rejects referencing an invoice that isn't finalized yet", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const draftInvoice = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "INVOICE", customerId, issueDate: "2026-08-19", lines: [] });

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "DELIVERY_NOTE",
        customerId,
        issueDate: "2026-08-20",
        lines: [],
        referencedDocumentId: draftInvoice.body.document.id,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("referenced_document_not_finalized");
  });

  it("rejects referencing a document from another business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const otherApp = createApp();
    const otherRes = await request(otherApp).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];
    const otherCustomer = await createCustomer(otherApp, otherCookies);
    const otherInvoice = await createFinalizedInvoice(otherApp, otherCookies, otherCustomer);

    const res = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "DELIVERY_NOTE",
        customerId,
        issueDate: "2026-08-20",
        lines: [],
        referencedDocumentId: otherInvoice.id,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("referenced_document_not_found");
  });

  it("rejects updating a referencedDocumentId to a non-invoice document via PATCH", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoice = await createFinalizedInvoice(app, cookies, customerId);

    const deliveryNote = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "DELIVERY_NOTE",
        customerId,
        issueDate: "2026-08-20",
        lines: [],
        referencedDocumentId: invoice.id,
      });

    const res = await request(app)
      .patch(`/documents/${deliveryNote.body.document.id}`)
      .set("Cookie", cookies)
      .send({
        type: "DELIVERY_NOTE",
        customerId,
        issueDate: "2026-08-20",
        lines: [],
        referencedDocumentId: null,
      });

    expect(res.status).toBe(200);
    expect(res.body.document.referencedDocument).toBeNull();
  });
});
