import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma.js";
import { resetDb } from "../test/db.js";
import * as renderDocumentPdfModule from "./pdf/render-document-pdf.js";
import * as mailerModule from "./mailer.js";
import { sendDueSoonReminders } from "./due-soon-reminders.js";

beforeEach(resetDb);

beforeEach(() => {
  vi.spyOn(renderDocumentPdfModule, "renderDocumentPdf").mockResolvedValue(Buffer.from("%PDF-fake"));
  vi.spyOn(mailerModule, "sendDocumentEmail").mockResolvedValue();
});

const DAY_MS = 24 * 60 * 60 * 1000;

function inDays(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

let userCounter = 0;

async function setupBusiness(dueSoonReminderDays = 3) {
  userCounter += 1;
  const user = await prisma.user.create({
    data: {
      email: `owner${userCounter}@example.com`,
      firebaseUid: `firebase-uid-${userCounter}`,
      trialEndsAt: inDays(14),
    },
  });
  const business = await prisma.business.create({
    data: { ownerId: user.id, name: "Kigali Traders", defaultTemplate: "MINIMAL", dueSoonReminderDays },
  });
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Acme Ltd", email: "customer@example.com" },
  });
  return { business, customer };
}

async function createInvoice(
  businessId: string,
  customerId: string,
  overrides: {
    dueDate: Date;
    paymentStatus?: "UNPAID" | "PARTIALLY_PAID" | "PAID" | null;
    remindersEnabled?: boolean;
    currency?: string;
    exchangeRate?: number | null;
    installments?: { amount: number; dueDate: Date; label?: string }[];
    dueSoonReminderFor?: Date | null;
  },
) {
  return prisma.document.create({
    data: {
      businessId,
      customerId,
      type: "INVOICE",
      status: "FINALIZED",
      template: "MINIMAL",
      number: "INV-0001",
      issueDate: new Date("2026-01-01"),
      dueDate: overrides.dueDate,
      paymentStatus: overrides.paymentStatus ?? "UNPAID",
      remindersEnabled: overrides.remindersEnabled ?? true,
      currency: overrides.currency ?? "RWF",
      exchangeRate: overrides.exchangeRate ?? null,
      dueSoonReminderFor: overrides.dueSoonReminderFor ?? null,
      subtotal: 10000,
      taxTotal: 0,
      total: 10000,
      lines: {
        create: [{ description: "Consulting", quantity: 1, unitPrice: 10000, taxRate: 0, lineTotal: 10000, sortOrder: 0 }],
      },
      installments: overrides.installments
        ? {
            create: overrides.installments.map((step, index) => ({
              amount: step.amount,
              dueDate: step.dueDate,
              label: step.label ?? null,
              sortOrder: index,
            })),
          }
        : undefined,
    },
  });
}

describe("sendDueSoonReminders", () => {
  it("reminds about an invoice that falls due within the window", async () => {
    const { business, customer } = await setupBusiness();
    await createInvoice(business.id, customer.id, { dueDate: inDays(2) });

    const sent = await sendDueSoonReminders(business.id);

    expect(sent).toHaveLength(1);
    const call = vi.mocked(mailerModule.sendDocumentEmail).mock.calls[0]![0];
    expect(call.subject).toMatch(/is due on/);
    expect(call.html).toContain("10,000 RWF");
  });

  it("still reminds about a payment that is due today", async () => {
    const { business, customer } = await setupBusiness();
    const today = new Date(Math.floor(Date.now() / DAY_MS) * DAY_MS);
    await createInvoice(business.id, customer.id, { dueDate: today });

    expect(await sendDueSoonReminders(business.id)).toHaveLength(1);
  });

  it("does not remind about one that is still far off, or already late", async () => {
    const { business, customer } = await setupBusiness();
    await createInvoice(business.id, customer.id, { dueDate: inDays(20) });

    expect(await sendDueSoonReminders(business.id)).toHaveLength(0);

    await prisma.document.updateMany({ data: { dueDate: inDays(-2) } });
    expect(await sendDueSoonReminders(business.id)).toHaveLength(0);
  });

  it("sends the note once for a due date, not every day", async () => {
    const { business, customer } = await setupBusiness();
    await createInvoice(business.id, customer.id, { dueDate: inDays(2) });

    await sendDueSoonReminders(business.id);
    const second = await sendDueSoonReminders(business.id);

    expect(second).toHaveLength(0);
    expect(mailerModule.sendDocumentEmail).toHaveBeenCalledTimes(1);
  });

  it("skips a paid invoice", async () => {
    const { business, customer } = await setupBusiness();
    await createInvoice(business.id, customer.id, { dueDate: inDays(1), paymentStatus: "PAID" });

    expect(await sendDueSoonReminders(business.id)).toHaveLength(0);
  });

  it("skips an invoice with reminders turned off for that document", async () => {
    const { business, customer } = await setupBusiness();
    await createInvoice(business.id, customer.id, { dueDate: inDays(1), remindersEnabled: false });

    expect(await sendDueSoonReminders(business.id)).toHaveLength(0);
  });

  it("does nothing when the business has turned the nudge off", async () => {
    const { business, customer } = await setupBusiness(0);
    await createInvoice(business.id, customer.id, { dueDate: inDays(1) });

    expect(await sendDueSoonReminders(business.id)).toHaveLength(0);
  });

  it("reminds about the next instalment, in its own amount, and again for the one after", async () => {
    const { business, customer } = await setupBusiness();
    const invoice = await createInvoice(business.id, customer.id, {
      dueDate: inDays(30),
      installments: [
        { label: "Deposit", amount: 4000, dueDate: inDays(2) },
        { label: "Balance", amount: 6000, dueDate: inDays(30) },
      ],
    });

    const first = await sendDueSoonReminders(business.id);
    expect(first).toHaveLength(1);
    const html = vi.mocked(mailerModule.sendDocumentEmail).mock.calls[0]![0].html;
    expect(html).toContain("4,000 RWF");
    expect(html).toContain("Deposit");

    // The deposit is paid and the balance is now the one coming up.
    await prisma.invoicePayment.create({
      data: {
        documentId: invoice.id,
        businessId: business.id,
        amount: 4000,
        method: "CASH",
        paidOn: new Date(),
        createdByUserId: business.ownerId,
      },
    });
    await prisma.document.update({
      where: { id: invoice.id },
      data: { amountPaid: 4000, paymentStatus: "PARTIALLY_PAID" },
    });
    await prisma.documentInstalment.updateMany({ where: { label: "Balance" }, data: { dueDate: inDays(2.5) } });

    const second = await sendDueSoonReminders(business.id);
    expect(second).toHaveLength(1);
    expect(vi.mocked(mailerModule.sendDocumentEmail).mock.calls[1]![0].html).toContain("6,000 RWF");
  });

  it("words a dollar invoice in dollars and offers no MoMo link", async () => {
    const { business, customer } = await setupBusiness();
    await prisma.business.update({ where: { id: business.id }, data: { momoEnabled: true } });
    await createInvoice(business.id, customer.id, { dueDate: inDays(1), currency: "USD", exchangeRate: 1450 });

    await sendDueSoonReminders(business.id);

    const html = vi.mocked(mailerModule.sendDocumentEmail).mock.calls[0]![0].html;
    expect(html).toContain("100.00 USD");
    expect(html).toContain(">View online<");
  });
});
