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
  return res.headers["set-cookie"] as unknown as string[];
}

async function createCustomer(app: ReturnType<typeof createApp>, cookies: string[]) {
  const res = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Musanze Supplies" });
  return res.body.customer.id as string;
}

async function createDraft(
  app: ReturnType<typeof createApp>,
  cookies: string[],
  customerId: string,
  hasLine = true,
) {
  const res = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-19",
      lines: hasLine ? [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }] : [],
    });
  return res.body.document.id as string;
}

describe("POST /documents/:id/finalize", () => {
  it("assigns INV-0001 to the first finalized invoice for a business", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const id = await createDraft(app, cookies, customerId);

    const res = await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.document.number).toBe("INV-0001");
    expect(res.body.document.status).toBe("FINALIZED");
  });

  it("assigns sequential numbers across repeated finalizes", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const firstId = await createDraft(app, cookies, customerId);
    await request(app).post(`/documents/${firstId}/finalize`).set("Cookie", cookies);

    const secondId = await createDraft(app, cookies, customerId);
    const res = await request(app).post(`/documents/${secondId}/finalize`).set("Cookie", cookies);

    expect(res.body.document.number).toBe("INV-0002");
  });

  it("never assigns the same number twice when two documents are finalized at the same instant", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);

    const firstId = await createDraft(app, cookies, customerId);
    const secondId = await createDraft(app, cookies, customerId);

    const [firstRes, secondRes] = await Promise.all([
      request(app).post(`/documents/${firstId}/finalize`).set("Cookie", cookies),
      request(app).post(`/documents/${secondId}/finalize`).set("Cookie", cookies),
    ]);

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    const numbers = [firstRes.body.document.number, secondRes.body.document.number];
    expect(new Set(numbers).size).toBe(2);
    expect(numbers.sort()).toEqual(["INV-0001", "INV-0002"]);
  });

  it("rejects finalizing a document with no lines", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const id = await createDraft(app, cookies, customerId, false);

    const res = await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
    expect(res.status).toBe(400);
  });

  it("rejects finalizing an already-finalized document", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const id = await createDraft(app, cookies, customerId);
    await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);

    const res = await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);
    expect(res.status).toBe(409);
  });

  it("returns 401 without a session", async () => {
    const res = await request(createApp()).post("/documents/x/finalize");
    expect(res.status).toBe(401);
  });

  it("recomputes the referenced invoice's payment status when finalizing a credit note against it", async () => {
    const app = createApp();
    const cookies = await registerAndGetCookies(app);
    const customerId = await createCustomer(app, cookies);
    const invoiceId = await createDraft(app, cookies, customerId);
    await request(app).post(`/documents/${invoiceId}/finalize`).set("Cookie", cookies);

    const invoiceBefore = await request(app).get(`/documents/${invoiceId}`).set("Cookie", cookies);
    expect(invoiceBefore.body.document.paymentStatus).toBe("UNPAID");

    const creditNote = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "CREDIT_NOTE",
        customerId,
        issueDate: "2026-08-20",
        lines: [{ description: "Printing", quantity: 1, unitPrice: 5000, taxRate: 18 }],
        referencedDocumentId: invoiceId,
      });
    await request(app).post(`/documents/${creditNote.body.document.id}/finalize`).set("Cookie", cookies);

    const invoiceAfter = await request(app).get(`/documents/${invoiceId}`).set("Cookie", cookies);
    expect(invoiceAfter.body.document.paymentStatus).toBe("PAID");
  });

  describe("yearly numbering reset", () => {
    it("embeds the current year in the number once yearly reset is enabled", async () => {
      const app = createApp();
      const cookies = await registerAndGetCookies(app);
      const customerId = await createCustomer(app, cookies);

      const sequences = await request(app).get("/business/sequences").set("Cookie", cookies);
      await request(app)
        .put("/business/sequences")
        .set("Cookie", cookies)
        .send(
          sequences.body.sequences.map((s: { type: string; prefix: string; nextNumber: number }) => ({
            ...s,
            resetYearly: s.type === "INVOICE",
          })),
        );

      const id = await createDraft(app, cookies, customerId);
      const res = await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);

      const year = new Date().getFullYear();
      expect(res.body.document.number).toBe(`INV-${year}-0001`);
    });

    it("resets the counter back to 1 when the calendar year changes", async () => {
      const app = createApp();
      const cookies = await registerAndGetCookies(app);
      const customerId = await createCustomer(app, cookies);

      const sequences = await request(app).get("/business/sequences").set("Cookie", cookies);
      await request(app)
        .put("/business/sequences")
        .set("Cookie", cookies)
        .send(
          sequences.body.sequences.map((s: { type: string; prefix: string; nextNumber: number }) => ({
            ...s,
            resetYearly: s.type === "INVOICE",
          })),
        );

      await prisma.documentSequence.updateMany({
        where: { type: "INVOICE" },
        data: { nextNumber: 6, lastResetYear: new Date().getFullYear() - 1 },
      });

      const id = await createDraft(app, cookies, customerId);
      const res = await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);

      const year = new Date().getFullYear();
      expect(res.body.document.number).toBe(`INV-${year}-0001`);
    });

    it("keeps the plain number format when yearly reset is not enabled", async () => {
      const app = createApp();
      const cookies = await registerAndGetCookies(app);
      const customerId = await createCustomer(app, cookies);
      const id = await createDraft(app, cookies, customerId);

      const res = await request(app).post(`/documents/${id}/finalize`).set("Cookie", cookies);

      expect(res.body.document.number).toBe("INV-0001");
    });
  });
});
