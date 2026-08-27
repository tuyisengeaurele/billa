import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { resetDb } from "../test/db.js";
import { prisma } from "./prisma.js";
import { recomputeInvoicePaymentStatus } from "./invoice-payment-status.js";
import request from "supertest";

beforeEach(resetDb);

async function setup() {
  const app = createApp();
  const res = await request(app).post("/auth/session").send({
    idToken: JSON.stringify({ uid: "owner@example.com", email: "owner@example.com" }),
    businessName: "Kigali Traders",
  });
  const cookies = res.headers["set-cookie"] as unknown as string[];

  const customer = await request(app).post("/customers").set("Cookie", cookies).send({ name: "Acme Ltd" });
  const customerId = customer.body.customer.id as string;

  const created = await request(app)
    .post("/documents")
    .set("Cookie", cookies)
    .send({
      type: "INVOICE",
      customerId,
      issueDate: "2026-08-19",
      lines: [{ description: "Cement", quantity: 1, unitPrice: 100000, taxRate: 0 }],
    });
  await request(app).post(`/documents/${created.body.document.id}/finalize`).set("Cookie", cookies);

  return { app, cookies, invoiceId: created.body.document.id as string, customerId };
}

describe("recomputeInvoicePaymentStatus", () => {
  it("marks an invoice UNPAID with no payments", async () => {
    const { invoiceId } = await setup();
    await recomputeInvoicePaymentStatus(invoiceId);

    const invoice = await prisma.document.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.paymentStatus).toBe("UNPAID");
    expect(invoice.amountPaid).toBe(0);
  });

  it("marks an invoice PARTIALLY_PAID when payments don't cover the total", async () => {
    const { invoiceId } = await setup();
    await prisma.invoicePayment.create({
      data: {
        businessId: (await prisma.document.findUniqueOrThrow({ where: { id: invoiceId } })).businessId,
        documentId: invoiceId,
        amount: 40000,
        method: "CASH",
        paidOn: new Date(),
        createdByUserId: (await prisma.user.findFirstOrThrow()).id,
      },
    });

    await recomputeInvoicePaymentStatus(invoiceId);

    const invoice = await prisma.document.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.paymentStatus).toBe("PARTIALLY_PAID");
    expect(invoice.amountPaid).toBe(40000);
  });

  it("marks an invoice PAID when payments cover the total", async () => {
    const { invoiceId } = await setup();
    await prisma.invoicePayment.create({
      data: {
        businessId: (await prisma.document.findUniqueOrThrow({ where: { id: invoiceId } })).businessId,
        documentId: invoiceId,
        amount: 100000,
        method: "CASH",
        paidOn: new Date(),
        createdByUserId: (await prisma.user.findFirstOrThrow()).id,
      },
    });

    await recomputeInvoicePaymentStatus(invoiceId);

    const invoice = await prisma.document.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.paymentStatus).toBe("PAID");
  });

  it("ignores voided payments", async () => {
    const { invoiceId } = await setup();
    await prisma.invoicePayment.create({
      data: {
        businessId: (await prisma.document.findUniqueOrThrow({ where: { id: invoiceId } })).businessId,
        documentId: invoiceId,
        amount: 100000,
        method: "CASH",
        paidOn: new Date(),
        voidedAt: new Date(),
        createdByUserId: (await prisma.user.findFirstOrThrow()).id,
      },
    });

    await recomputeInvoicePaymentStatus(invoiceId);

    const invoice = await prisma.document.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.paymentStatus).toBe("UNPAID");
  });

  it("nets a finalized credit note against the amount owed", async () => {
    const { app, cookies, invoiceId, customerId } = await setup();

    const creditNote = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({
        type: "CREDIT_NOTE",
        customerId,
        issueDate: "2026-08-20",
        lines: [{ description: "Return", quantity: 1, unitPrice: 30000, taxRate: 0 }],
        referencedDocumentId: invoiceId,
      });
    await request(app).post(`/documents/${creditNote.body.document.id}/finalize`).set("Cookie", cookies);

    await recomputeInvoicePaymentStatus(invoiceId);

    const invoice = await prisma.document.findUniqueOrThrow({ where: { id: invoiceId } });
    // total owed after credit = 70000, no payments yet -> still UNPAID but amountPaid stays 0
    expect(invoice.paymentStatus).toBe("UNPAID");

    await prisma.invoicePayment.create({
      data: {
        businessId: invoice.businessId,
        documentId: invoiceId,
        amount: 70000,
        method: "CASH",
        paidOn: new Date(),
        createdByUserId: (await prisma.user.findFirstOrThrow()).id,
      },
    });
    await recomputeInvoicePaymentStatus(invoiceId);
    const invoiceAfter = await prisma.document.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoiceAfter.paymentStatus).toBe("PAID");
  });

  it("does not overwrite a WRITTEN_OFF status", async () => {
    const { invoiceId } = await setup();
    await prisma.document.update({
      where: { id: invoiceId },
      data: { paymentStatus: "WRITTEN_OFF", writtenOffAt: new Date(), writeOffReason: "Uncollectable" },
    });

    await recomputeInvoicePaymentStatus(invoiceId);

    const invoice = await prisma.document.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.paymentStatus).toBe("WRITTEN_OFF");
  });

  it("does nothing for a non-invoice document", async () => {
    const { app, cookies, customerId } = await setup();
    const quote = await request(app)
      .post("/documents")
      .set("Cookie", cookies)
      .send({ type: "QUOTE", customerId, issueDate: "2026-08-19", lines: [] });

    await expect(recomputeInvoicePaymentStatus(quote.body.document.id)).resolves.toBeUndefined();
  });
});
