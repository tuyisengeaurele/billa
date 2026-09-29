import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";
import { prisma } from "../lib/prisma.js";
import * as renderDocumentPdfModule from "../lib/pdf/render-document-pdf.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

async function setUp(app: ReturnType<typeof createApp>, email = "owner@example.com") {
  const session = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: email, email }),
    businessName: "Kigali Traders",
  });
  const cookies = session.headers["set-cookie"] as unknown as string[];
  const created = await request(app).post("/api-keys").set("Cookie", cookies).send({ name: "Test key" });
  return { cookies, key: created.body.key as string, keyId: created.body.apiKey.id as string, businessId: session.body.business.id as string };
}

const auth = (key: string) => ({ Authorization: `Bearer ${key}` });

describe("API key authentication", () => {
  it("rejects a request with no key", async () => {
    const res = await request(createApp()).get("/api/v1/customers");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_api_key");
  });

  it("rejects a malformed or unknown key", async () => {
    const app = createApp();
    await setUp(app);
    expect((await request(app).get("/api/v1/customers").set("Authorization", "Bearer nope")).status).toBe(401);
    expect(
      (await request(app).get("/api/v1/customers").set("Authorization", `Bearer bla_live_${"x".repeat(40)}`)).status,
    ).toBe(401);
    expect((await request(app).get("/api/v1/customers").set("Authorization", "Basic abc")).status).toBe(401);
  });

  it("rejects a revoked key", async () => {
    const app = createApp();
    const { cookies, key, keyId } = await setUp(app);
    await request(app).delete(`/api-keys/${keyId}`).set("Cookie", cookies);

    const res = await request(app).get("/api/v1/customers").set(auth(key));

    expect(res.status).toBe(401);
  });

  it("does not accept a browser session in place of a key", async () => {
    const app = createApp();
    const { cookies } = await setUp(app);

    const res = await request(app).get("/api/v1/customers").set("Cookie", cookies);

    expect(res.status).toBe(401);
  });

  it("records when a key was last used", async () => {
    const app = createApp();
    const { key, keyId } = await setUp(app);

    await request(app).get("/api/v1/customers").set(auth(key));

    const stored = await prisma.apiKey.findUniqueOrThrow({ where: { id: keyId } });
    expect(stored.lastUsedAt).not.toBeNull();
  });

  it("stops working when the business's subscription lapses, for writes only", async () => {
    const app = createApp();
    const { key, businessId } = await setUp(app);
    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    await prisma.user.update({
      where: { id: business.ownerId },
      data: { trialEndsAt: new Date(Date.now() - 1000), currentPeriodEnd: null },
    });

    const read = await request(app).get("/api/v1/customers").set(auth(key));
    const write = await request(app).post("/api/v1/customers").set(auth(key)).send({ name: "Acme" });

    expect(read.status).toBe(200);
    expect(write.status).toBe(402);
  });
});

describe("/api/v1/customers and /api/v1/items", () => {
  it("creates, lists, reads and updates a customer", async () => {
    const app = createApp();
    const { key } = await setUp(app);

    const created = await request(app).post("/api/v1/customers").set(auth(key)).send({ name: "Acme Ltd", phone: "0788123456" });
    const id = created.body.customer.id as string;
    const list = await request(app).get("/api/v1/customers").set(auth(key));
    const one = await request(app).get(`/api/v1/customers/${id}`).set(auth(key));
    const patched = await request(app).patch(`/api/v1/customers/${id}`).set(auth(key)).send({ email: "hi@acme.rw" });

    expect(created.status).toBe(201);
    expect(list.body.results.map((c: { id: string }) => c.id)).toEqual([id]);
    expect(one.body.customer.name).toBe("Acme Ltd");
    expect(patched.status).toBe(200);
  });

  it("validates the same way the app does", async () => {
    const app = createApp();
    const { key } = await setUp(app);

    const res = await request(app).post("/api/v1/customers").set(auth(key)).send({ name: "" });

    expect(res.status).toBe(400);
  });

  it("creates, lists and updates an item", async () => {
    const app = createApp();
    const { key } = await setUp(app);

    const created = await request(app)
      .post("/api/v1/items")
      .set(auth(key))
      .send({ description: "Cement", unitPrice: 12500, unit: "bag" });
    const patched = await request(app)
      .patch(`/api/v1/items/${created.body.item.id}`)
      .set(auth(key))
      .send({ unitPrice: 13000 });
    const list = await request(app).get("/api/v1/items").set(auth(key));

    expect(created.status).toBe(201);
    expect(patched.status).toBe(200);
    expect(list.body.results[0]).toMatchObject({ description: "Cement", unitPrice: 13000 });
  });

  it("only ever shows the key's own business", async () => {
    const app = createApp();
    const first = await setUp(app);
    const second = await setUp(app, "other@example.com");
    const created = await request(app).post("/api/v1/customers").set(auth(first.key)).send({ name: "Only Mine" });

    const list = await request(app).get("/api/v1/customers").set(auth(second.key));
    const one = await request(app).get(`/api/v1/customers/${created.body.customer.id}`).set(auth(second.key));

    expect(list.body.results).toHaveLength(0);
    expect(one.status).toBe(404);
  });
});

describe("/api/v1/documents", () => {
  it("creates a draft, finalizes it, reads it and records a payment", async () => {
    const app = createApp();
    const { key } = await setUp(app);
    const customer = await request(app).post("/api/v1/customers").set(auth(key)).send({ name: "Acme Ltd" });

    const created = await request(app)
      .post("/api/v1/documents")
      .set(auth(key))
      .send({
        type: "INVOICE",
        customerId: customer.body.customer.id,
        issueDate: "2026-09-01",
        lines: [{ description: "Cement", quantity: 2, unitPrice: 5000, taxRate: 18 }],
      });
    const id = created.body.document.id as string;
    const finalized = await request(app).post(`/api/v1/documents/${id}/finalize`).set(auth(key));
    const payment = await request(app)
      .post(`/api/v1/documents/${id}/payments`)
      .set(auth(key))
      .send({ amount: 5000, method: "BANK_TRANSFER", paidOn: "2026-09-02" });
    const one = await request(app).get(`/api/v1/documents/${id}`).set(auth(key));

    expect(created.status).toBe(201);
    expect(finalized.status).toBe(200);
    expect(finalized.body.document.number).toBe("INV-0001");
    expect(payment.status).toBe(201);
    expect(one.body.document.amountPaid).toBe(5000);
    expect(one.body.document.paymentStatus).toBe("PARTIALLY_PAID");
  });

  it("downloads the PDF", async () => {
    vi.spyOn(renderDocumentPdfModule, "renderDocumentPdf").mockResolvedValue(Buffer.from("%PDF-fake"));
    const app = createApp();
    const { key } = await setUp(app);
    const customer = await request(app).post("/api/v1/customers").set(auth(key)).send({ name: "Acme Ltd" });
    const created = await request(app)
      .post("/api/v1/documents")
      .set(auth(key))
      .send({
        type: "INVOICE",
        customerId: customer.body.customer.id,
        issueDate: "2026-09-01",
        lines: [{ description: "Cement", quantity: 1, unitPrice: 5000, taxRate: 18 }],
      });

    const res = await request(app).get(`/api/v1/documents/${created.body.document.id}/pdf`).set(auth(key));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
  });
});

describe("what /api/v1 does not expose", () => {
  it("does not offer deleting, exports, imports or anything outside the allowlist", async () => {
    const app = createApp();
    const { key } = await setUp(app);
    const customer = await request(app).post("/api/v1/customers").set(auth(key)).send({ name: "Acme Ltd" });
    const id = customer.body.customer.id as string;

    const responses = await Promise.all([
      request(app).delete(`/api/v1/customers/${id}`).set(auth(key)),
      request(app).get("/api/v1/customers/export.csv").set(auth(key)),
      request(app).post("/api/v1/customers/import").set(auth(key)).send({ rows: [{ name: "X" }] }),
      request(app).delete("/api/v1/documents/abc").set(auth(key)),
      request(app).get("/api/v1/admin/users").set(auth(key)),
      request(app).get("/api/v1/business").set(auth(key)),
      request(app).post("/api/v1/documents/abc/write-off").set(auth(key)).send({ writeOffReason: "x" }),
    ]);

    for (const res of responses) expect(res.status).toBe(404);
    expect(await prisma.customer.count()).toBe(1);
  });
});
