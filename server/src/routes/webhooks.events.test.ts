import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";
import { prisma } from "../lib/prisma.js";
import { encryptWithKey } from "../lib/encryption.js";
import { setDeliveryScheduler, WEBHOOK_SECRET_KEY_ENV } from "../lib/webhooks/dispatch.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
  process.env[WEBHOOK_SECRET_KEY_ENV] ??= Buffer.alloc(32, 9).toString("base64");
});

beforeEach(async () => {
  await resetDb();
  setDeliveryScheduler(() => {});
});

async function setUp(app: ReturnType<typeof createApp>) {
  const session = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  const cookies = session.headers["set-cookie"] as unknown as string[];
  const businessId = session.body.business.id as string;
  await prisma.webhookEndpoint.create({
    data: {
      businessId,
      url: "https://hooks.example.com/billa",
      secretEnc: encryptWithKey("whsec_test", WEBHOOK_SECRET_KEY_ENV),
      events: ["document.finalized", "payment.received"],
    },
  });
  const customer = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId: customer.body.customer.id,
      issueDate: "2026-09-01",
      lines: [{ description: "Cement", quantity: 2, unitPrice: 5000, taxRate: 18 }],
    });
  return { cookies, documentId: created.body.document.id as string };
}

describe("webhook events", () => {
  it("emits document.finalized with the document's number and totals", async () => {
    const app = createApp();
    const { cookies, documentId } = await setUp(app);

    await request(app).post(`/documents/${documentId}/finalize`).set("Cookie", cookies);

    const delivery = await prisma.webhookDelivery.findFirstOrThrow({ where: { event: "document.finalized" } });
    expect(delivery.payload).toMatchObject({
      event: "document.finalized",
      data: { id: documentId, type: "INVOICE", number: "INV-0001", subtotal: 10000, taxTotal: 1800, total: 11800 },
    });
  });

  it("does not emit anything for a draft that is only saved", async () => {
    const app = createApp();
    await setUp(app);

    expect(await prisma.webhookDelivery.count()).toBe(0);
  });

  it("emits payment.received for a payment recorded by hand", async () => {
    const app = createApp();
    const { cookies, documentId } = await setUp(app);
    await request(app).post(`/documents/${documentId}/finalize`).set("Cookie", cookies);

    const res = await request(app)
      .post(`/documents/${documentId}/payments`)
      .set("Cookie", cookies)
      .send({ amount: 5000, method: "CASH", paidOn: "2026-09-02" });

    const delivery = await prisma.webhookDelivery.findFirstOrThrow({ where: { event: "payment.received" } });
    expect(delivery.payload).toMatchObject({
      data: { id: res.body.payment.id, documentId, invoiceNumber: "INV-0001", amount: 5000, method: "CASH" },
    });
  });

  it("does not put secrets or the customer's private data in the payload", async () => {
    const app = createApp();
    const { cookies, documentId } = await setUp(app);
    await request(app).post(`/documents/${documentId}/finalize`).set("Cookie", cookies);

    const delivery = await prisma.webhookDelivery.findFirstOrThrow({ where: { event: "document.finalized" } });
    const text = JSON.stringify(delivery.payload);

    expect(text).not.toContain("whsec_test");
    expect(text).not.toContain("publicToken");
  });
});
