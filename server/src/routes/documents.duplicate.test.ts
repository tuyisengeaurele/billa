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

describe("POST /documents/:id/duplicate", () => {
  it("creates a new draft with the same customer, lines, and notes", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const original = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId,
        issueDate: "2026-08-19",
        notes: "Thanks for your business",
        lines: [{ description: "Cement", quantity: 5, unitPrice: 13000, taxRate: 18 }],
      });
    await request(app).post(`/documents/${original.body.document.id}/finalize`).set("Cookie", cookies);

    const res = await request(app)
      .post(`/documents/${original.body.document.id}/duplicate`)
      .set("Cookie", cookies);

    expect(res.status).toBe(201);
    expect(res.body.document.id).not.toBe(original.body.document.id);
    expect(res.body.document.status).toBe("DRAFT");
    expect(res.body.document.number).toBeNull();
    expect(res.body.document.customerId).toBe(customerId);
    expect(res.body.document.notes).toBe("Thanks for your business");
    expect(res.body.document.total).toBe(76700);
    expect(res.body.document.lines).toHaveLength(1);
    expect(res.body.document.lines[0].description).toBe("Cement");
  });

  it("carries over a valid referencedDocumentId", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const invoice = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "INVOICE", customerId, issueDate: "2026-08-19", lines: [{ description: "Cement", quantity: 5, unitPrice: 13000, taxRate: 18 }] });
    const finalizedInvoice = await request(app)
      .post(`/documents/${invoice.body.document.id}/finalize`)
      .set("Cookie", cookies);

    const deliveryNote = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "DELIVERY_NOTE",
        customerId,
        issueDate: "2026-08-20",
        lines: [],
        referencedDocumentId: finalizedInvoice.body.document.id,
      });

    const res = await request(app)
      .post(`/documents/${deliveryNote.body.document.id}/duplicate`)
      .set("Cookie", cookies);

    expect(res.status).toBe(201);
    expect(res.body.document.referencedDocument.id).toBe(finalizedInvoice.body.document.id);
  });

  it("returns 404 for a document belonging to another business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const doc = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "INVOICE", customerId, issueDate: "2026-08-19", lines: [] });

    const otherRes = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Co",
    });
    const otherCookies = otherRes.headers["set-cookie"] as unknown as string[];

    const res = await request(app).post(`/documents/${doc.body.document.id}/duplicate`).set("Cookie", otherCookies);
    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/documents/some-id/duplicate");
    expect(res.status).toBe(401);
  });
});
