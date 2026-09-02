import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma.js";
import { resetDb } from "../test/db.js";
import * as renderDocumentPdfModule from "./pdf/render-document-pdf.js";
import * as mailerModule from "./mailer.js";
import { sendQuoteExpiryReminders } from "./quote-expiry-reminders.js";

beforeEach(resetDb);

beforeEach(() => {
  vi.spyOn(renderDocumentPdfModule, "renderDocumentPdf").mockResolvedValue(Buffer.from("%PDF-fake"));
  vi.spyOn(mailerModule, "sendDocumentEmail").mockResolvedValue();
});

let userCounter = 0;

async function createUser() {
  userCounter += 1;
  return prisma.user.create({
    data: {
      email: `owner${userCounter}@example.com`,
      firebaseUid: `firebase-uid-${userCounter}`,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
}

async function setupBusiness(customerEmail: string | null = "customer@example.com") {
  const user = await createUser();
  const business = await prisma.business.create({
    data: { ownerId: user.id, name: "Kigali Traders", defaultTemplate: "MINIMAL" },
  });
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Acme Ltd", email: customerEmail },
  });
  return { business, customer };
}

async function createQuote(
  businessId: string,
  customerId: string,
  overrides: {
    type?: "QUOTE" | "PROFORMA";
    dueDate: Date | null;
    expiryReminderSentAt?: Date | null;
    status?: "DRAFT" | "FINALIZED";
    declinedAt?: Date | null;
  },
) {
  return prisma.document.create({
    data: {
      businessId,
      customerId,
      type: overrides.type ?? "QUOTE",
      status: overrides.status ?? "FINALIZED",
      template: "MINIMAL",
      number: "QUO-0001",
      issueDate: new Date("2026-01-01"),
      dueDate: overrides.dueDate,
      expiryReminderSentAt: overrides.expiryReminderSentAt ?? null,
      declinedAt: overrides.declinedAt ?? null,
      subtotal: 5000,
      taxTotal: 900,
      total: 5900,
      lines: {
        create: [
          { description: "Consulting", quantity: 1, unitPrice: 5000, taxRate: 18, lineTotal: 5900, sortOrder: 0 },
        ],
      },
    },
  });
}

const SOON = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

describe("sendQuoteExpiryReminders", () => {
  it("sends a reminder for a finalized quote expiring within 3 days", async () => {
    const { business, customer } = await setupBusiness("customer@example.com");
    await createQuote(business.id, customer.id, { dueDate: SOON });

    const sent = await sendQuoteExpiryReminders(business.id);

    expect(sent).toHaveLength(1);
    expect(sent[0].sentTo).toBe("customer@example.com");
    expect(mailerModule.sendDocumentEmail).toHaveBeenCalledTimes(1);
  });

  it("sends a reminder for a finalized proforma too", async () => {
    const { business, customer } = await setupBusiness("customer@example.com");
    await createQuote(business.id, customer.id, { type: "PROFORMA", dueDate: SOON });

    const sent = await sendQuoteExpiryReminders(business.id);

    expect(sent).toHaveLength(1);
  });

  it("does not remind about a quote expiring more than 3 days from now", async () => {
    const { business, customer } = await setupBusiness();
    const farOut = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await createQuote(business.id, customer.id, { dueDate: farOut });

    const sent = await sendQuoteExpiryReminders(business.id);

    expect(sent).toHaveLength(0);
  });

  it("does not remind twice for the same quote", async () => {
    const { business, customer } = await setupBusiness();
    await createQuote(business.id, customer.id, { dueDate: SOON, expiryReminderSentAt: new Date() });

    const sent = await sendQuoteExpiryReminders(business.id);

    expect(sent).toHaveLength(0);
  });

  it("does not remind about a declined quote", async () => {
    const { business, customer } = await setupBusiness();
    await createQuote(business.id, customer.id, { dueDate: SOON, declinedAt: new Date() });

    const sent = await sendQuoteExpiryReminders(business.id);

    expect(sent).toHaveLength(0);
  });

  it("does not remind about a draft quote", async () => {
    const { business, customer } = await setupBusiness();
    await createQuote(business.id, customer.id, { dueDate: SOON, status: "DRAFT" });

    const sent = await sendQuoteExpiryReminders(business.id);

    expect(sent).toHaveLength(0);
  });

  it("skips a quote with reminders turned off for that document", async () => {
    const { business, customer } = await setupBusiness("customer@example.com");
    const quote = await createQuote(business.id, customer.id, { dueDate: SOON });
    await prisma.document.update({ where: { id: quote.id }, data: { remindersEnabled: false } });

    const sent = await sendQuoteExpiryReminders(business.id);

    expect(sent).toHaveLength(0);
  });

  it("skips a quote whose customer has no email on file", async () => {
    const { business, customer } = await setupBusiness(null);
    await createQuote(business.id, customer.id, { dueDate: SOON });

    const sent = await sendQuoteExpiryReminders(business.id);

    expect(sent).toHaveLength(0);
  });

  it("does not remind about an invoice (only quotes and proformas)", async () => {
    const { business, customer } = await setupBusiness();
    await prisma.document.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        type: "INVOICE",
        status: "FINALIZED",
        template: "MINIMAL",
        number: "INV-0001",
        issueDate: new Date("2026-01-01"),
        dueDate: SOON,
        subtotal: 5000,
        taxTotal: 900,
        total: 5900,
      },
    });

    const sent = await sendQuoteExpiryReminders(business.id);

    expect(sent).toHaveLength(0);
  });

  it("marks the quote as reminded and leaves the customer visible in the returned list", async () => {
    const { business, customer } = await setupBusiness("customer@example.com");
    const quote = await createQuote(business.id, customer.id, { dueDate: SOON });

    await sendQuoteExpiryReminders(business.id);

    const updated = await prisma.document.findUniqueOrThrow({ where: { id: quote.id } });
    expect(updated.expiryReminderSentAt).not.toBeNull();
  });

  it("respects the business's reminders-enabled toggle", async () => {
    const { business, customer } = await setupBusiness("customer@example.com");
    await prisma.business.update({ where: { id: business.id }, data: { remindersEnabled: false } });
    await createQuote(business.id, customer.id, { dueDate: SOON });

    const sent = await sendQuoteExpiryReminders(business.id);

    expect(sent).toHaveLength(0);
  });
});
