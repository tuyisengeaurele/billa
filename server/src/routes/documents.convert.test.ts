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

async function createFinalizedProforma(app: ReturnType<typeof createApp>, cookies: string[], customerId: string) {
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "PROFORMA",
      customerId,
      issueDate: "2026-08-01",
      notes: "Payment due on delivery",
      lines: [{ description: "Printing", quantity: 2, unitPrice: 5000, taxRate: 18 }],
    });
  const id = created.body.document.id as string;
  await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
  return id;
}

describe("POST /documents/:id/convert", () => {
  it("creates a draft invoice copying the proforma's customer, lines, and notes", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const proformaId = await createFinalizedProforma(app, cookies, customerId);

    const res = await request(app).post(`/documents/${proformaId}/convert`).set("Cookie", cookies);

    expect(res.status).toBe(201);
    expect(res.body.document.type).toBe("INVOICE");
    expect(res.body.document.status).toBe("DRAFT");
    expect(res.body.document.number).toBeNull();
    expect(res.body.document.customer.name).toBe("Musanze Supplies");
    expect(res.body.document.notes).toBe("Payment due on delivery");
    expect(res.body.document.lines).toHaveLength(1);
    expect(res.body.document.lines[0].description).toBe("Printing");
    expect(res.body.document.subtotal).toBe(10000);
    expect(res.body.document.taxTotal).toBe(1800);
    expect(res.body.document.total).toBe(11800);
    expect(res.body.document.convertedFrom.id).toBe(proformaId);
  });

  it("sets the invoice's issue date to today, not the proforma's issue date", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const proformaId = await createFinalizedProforma(app, cookies, customerId);

    const res = await request(app).post(`/documents/${proformaId}/convert`).set("Cookie", cookies);

    const today = new Date().toISOString().slice(0, 10);
    expect(res.body.document.issueDate.slice(0, 10)).toBe(today);
  });

  it("links the proforma to the new invoice via convertedTo", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const proformaId = await createFinalizedProforma(app, cookies, customerId);

    const convertRes = await request(app).post(`/documents/${proformaId}/convert`).set("Cookie", cookies);
    const proformaRes = await request(app).get(`/documents/${proformaId}`).set("Cookie", cookies);

    expect(proformaRes.body.document.convertedTo.id).toBe(convertRes.body.document.id);
  });

  it("rejects converting a draft proforma", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "PROFORMA", customerId, issueDate: "2026-08-01", lines: [] });

    const res = await request(app).post(`/documents/${created.body.document.id}/convert`).set("Cookie", cookies);
    expect(res.status).toBe(409);
  });

  it("rejects converting a non-proforma document", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const created = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "INVOICE",
        customerId,
        issueDate: "2026-08-01",
        lines: [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }],
      });
    await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);

    const res = await request(app).post(`/documents/${created.body.document.id}/convert`).set("Cookie", cookies);
    expect(res.status).toBe(400);
  });

  it("rejects converting the same proforma twice", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const proformaId = await createFinalizedProforma(app, cookies, customerId);
    await request(app).post(`/documents/${proformaId}/convert`).set("Cookie", cookies);

    const res = await request(app).post(`/documents/${proformaId}/convert`).set("Cookie", cookies);
    expect(res.status).toBe(409);
  });

  it("returns 404 for a proforma belonging to another business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const proformaId = await createFinalizedProforma(app, cookies, customerId);

    const otherCookies = await request(app).post("/auth/session").send({
      idToken: JSON.stringify({ uid: "other@example.com", email: "other@example.com" }),
      businessName: "Other Biz",
    });

    const res = await request(app)
      .post(`/documents/${proformaId}/convert`)
      .set("Cookie", otherCookies.headers["set-cookie"] as unknown as string[]);
    expect(res.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/documents/x/convert");
    expect(res.status).toBe(401);
  });
});
