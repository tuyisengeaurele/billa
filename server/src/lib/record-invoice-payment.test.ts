import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";
import { prisma } from "./prisma.js";
import { recordInvoicePayment } from "./record-invoice-payment.js";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET ??= "test-secret";
  process.env.JWT_REFRESH_TTL ??= "30d";
});

beforeEach(resetDb);

async function setup() {
  const app = createApp();
  const session = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  const cookies = session.headers["set-cookie"] as unknown as string[];

  const customer = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId: customer.body.customer.id,
      issueDate: "2026-09-01",
      lines: [{ description: "Cement", quantity: 1, unitPrice: 100000, taxRate: 0 }],
    });
  await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);

  const business = await prisma.business.findFirstOrThrow({ where: { name: "Kigali Traders" } });
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@example.com" } });

  return { businessId: business.id, ownerId: owner.id, documentId: created.body.document.id as string };
}

describe("recordInvoicePayment", () => {
  it("creates the payment, recomputes the invoice's payment status, and notifies the owner", async () => {
    const { businessId, ownerId, documentId } = await setup();

    const payment = await recordInvoicePayment({
      businessId,
      documentId,
      amount: 40000,
      method: "MOBILE_MONEY",
      paidOn: new Date("2026-09-01"),
      createdByUserId: ownerId,
    });

    expect(payment.amount).toBe(40000);

    const invoice = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(invoice.paymentStatus).toBe("PARTIALLY_PAID");
    expect(invoice.amountPaid).toBe(40000);

    const notifications = await prisma.notification.findMany({ where: { userId: ownerId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ type: "PAYMENT_RECEIVED", link: `/documents/${documentId}` });
  });

  it("links the payment to a MomoPaymentRequest when one is given", async () => {
    const { businessId, ownerId, documentId } = await setup();
    const momoRequest = await prisma.momoPaymentRequest.create({
      data: {
        businessId,
        documentId,
        referenceId: "ref-1",
        phoneNumber: "250788000000",
        amount: 40000,
        status: "SUCCESSFUL",
      },
    });

    const payment = await recordInvoicePayment({
      businessId,
      documentId,
      amount: 40000,
      method: "MOBILE_MONEY",
      paidOn: new Date("2026-09-01"),
      createdByUserId: ownerId,
      momoPaymentRequestId: momoRequest.id,
    });

    expect(payment.momoPaymentRequestId).toBe(momoRequest.id);
  });
});
