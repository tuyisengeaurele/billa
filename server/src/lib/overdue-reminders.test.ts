import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma.js";
import { resetDb } from "../test/db.js";
import * as renderDocumentPdfModule from "./pdf/render-document-pdf.js";
import * as mailerModule from "./mailer.js";
import { sendOverdueReminders } from "./overdue-reminders.js";

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

async function createOverdueInvoice(
  businessId: string,
  customerId: string,
  overrides: {
    dueDate: Date;
    lastReminderSentAt?: Date | null;
    status?: "DRAFT" | "FINALIZED";
    paymentStatus?: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "WRITTEN_OFF" | null;
  },
) {
  return prisma.document.create({
    data: {
      businessId,
      customerId,
      type: "INVOICE",
      status: overrides.status ?? "FINALIZED",
      template: "MINIMAL",
      number: "INV-0001",
      issueDate: new Date("2026-01-01"),
      dueDate: overrides.dueDate,
      lastReminderSentAt: overrides.lastReminderSentAt ?? null,
      paymentStatus: overrides.paymentStatus ?? null,
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

describe("sendOverdueReminders", () => {
  it("sends a reminder for a finalized invoice past its due date", async () => {
    const { business, customer } = await setupBusiness("customer@example.com");
    const pastDue = new Date("2020-01-01");
    await createOverdueInvoice(business.id, customer.id, { dueDate: pastDue });

    const sent = await sendOverdueReminders(business.id);

    expect(sent).toHaveLength(1);
    expect(sent[0].sentTo).toBe("customer@example.com");
    expect(mailerModule.sendDocumentEmail).toHaveBeenCalledTimes(1);
  });

  it("notifies the owner in-app when a reminder is sent", async () => {
    const { business, customer } = await setupBusiness("customer@example.com");
    await createOverdueInvoice(business.id, customer.id, { dueDate: new Date("2020-01-01") });

    await sendOverdueReminders(business.id);

    const notifications = await prisma.notification.findMany({ where: { userId: business.ownerId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ type: "INVOICE_OVERDUE", title: "INV-0001 is overdue" });
  });

  it("does not remind about an invoice that's already been paid in full", async () => {
    const { business, customer } = await setupBusiness("customer@example.com");
    await createOverdueInvoice(business.id, customer.id, {
      dueDate: new Date("2020-01-01"),
      paymentStatus: "PAID",
    });

    const sent = await sendOverdueReminders(business.id);

    expect(sent).toHaveLength(0);
  });

  it("does not remind about an invoice that's been written off", async () => {
    const { business, customer } = await setupBusiness("customer@example.com");
    await createOverdueInvoice(business.id, customer.id, {
      dueDate: new Date("2020-01-01"),
      paymentStatus: "WRITTEN_OFF",
    });

    const sent = await sendOverdueReminders(business.id);

    expect(sent).toHaveLength(0);
  });

  it("still reminds about an invoice that's only partially paid", async () => {
    const { business, customer } = await setupBusiness("customer@example.com");
    await createOverdueInvoice(business.id, customer.id, {
      dueDate: new Date("2020-01-01"),
      paymentStatus: "PARTIALLY_PAID",
    });

    const sent = await sendOverdueReminders(business.id);

    expect(sent).toHaveLength(1);
  });

  it("does not remind for an invoice that isn't overdue yet", async () => {
    const { business, customer } = await setupBusiness();
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await createOverdueInvoice(business.id, customer.id, { dueDate: future });

    const sent = await sendOverdueReminders(business.id);

    expect(sent).toHaveLength(0);
  });

  it("does not remind for a draft invoice", async () => {
    const { business, customer } = await setupBusiness();
    await createOverdueInvoice(business.id, customer.id, { dueDate: new Date("2020-01-01"), status: "DRAFT" });

    const sent = await sendOverdueReminders(business.id);

    expect(sent).toHaveLength(0);
  });

  it("does not remind a customer with no email on file", async () => {
    const { business, customer } = await setupBusiness(null);
    await createOverdueInvoice(business.id, customer.id, { dueDate: new Date("2020-01-01") });

    const sent = await sendOverdueReminders(business.id);

    expect(sent).toHaveLength(0);
  });

  it("does not re-send a reminder sent within the last 7 days", async () => {
    const { business, customer } = await setupBusiness();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await createOverdueInvoice(business.id, customer.id, {
      dueDate: new Date("2020-01-01"),
      lastReminderSentAt: twoDaysAgo,
    });

    const sent = await sendOverdueReminders(business.id);

    expect(sent).toHaveLength(0);
  });

  it("sends again once the cooldown has passed", async () => {
    const { business, customer } = await setupBusiness();
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await createOverdueInvoice(business.id, customer.id, {
      dueDate: new Date("2020-01-01"),
      lastReminderSentAt: tenDaysAgo,
    });

    const sent = await sendOverdueReminders(business.id);

    expect(sent).toHaveLength(1);
  });

  it("does not send any reminders when they're disabled for the business", async () => {
    const { business, customer } = await setupBusiness();
    await prisma.business.update({ where: { id: business.id }, data: { remindersEnabled: false } });
    await createOverdueInvoice(business.id, customer.id, { dueDate: new Date("2020-01-01") });

    const sent = await sendOverdueReminders(business.id);

    expect(sent).toHaveLength(0);
  });

  it("uses the business's configured cadence instead of the default 7 days", async () => {
    const { business, customer } = await setupBusiness();
    await prisma.business.update({ where: { id: business.id }, data: { reminderCadenceDays: 2 } });
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await createOverdueInvoice(business.id, customer.id, {
      dueDate: new Date("2020-01-01"),
      lastReminderSentAt: threeDaysAgo,
    });

    const sent = await sendOverdueReminders(business.id);

    expect(sent).toHaveLength(1);
  });

  it("still respects a longer configured cadence even past the old fixed 7-day window", async () => {
    const { business, customer } = await setupBusiness();
    await prisma.business.update({ where: { id: business.id }, data: { reminderCadenceDays: 14 } });
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await createOverdueInvoice(business.id, customer.id, {
      dueDate: new Date("2020-01-01"),
      lastReminderSentAt: tenDaysAgo,
    });

    const sent = await sendOverdueReminders(business.id);

    expect(sent).toHaveLength(0);
  });
});
