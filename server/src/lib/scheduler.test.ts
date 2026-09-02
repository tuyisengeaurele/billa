import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma.js";
import { resetDb } from "../test/db.js";
import { runScheduledJobs } from "./scheduler.js";
import * as mailerModule from "./mailer.js";
import * as recurringModule from "./recurring-documents.js";

beforeEach(async () => {
  vi.spyOn(mailerModule, "sendDocumentEmail").mockResolvedValue();
  vi.spyOn(mailerModule, "sendEmail").mockResolvedValue();
  await resetDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

let userCounter = 0;

async function createBusiness(trialEndsAt: Date) {
  userCounter += 1;
  const user = await prisma.user.create({
    data: { email: `owner${userCounter}@example.com`, firebaseUid: `firebase-uid-${userCounter}`, trialEndsAt },
  });
  const business = await prisma.business.create({
    data: { ownerId: user.id, name: `Business ${userCounter}`, defaultTemplate: "MINIMAL" },
  });
  const customer = await prisma.customer.create({ data: { businessId: business.id, name: "Acme Ltd" } });
  return { user, business, customer };
}

async function createDueRecurringDocument(businessId: string, customerId: string) {
  return prisma.document.create({
    data: {
      businessId,
      customerId,
      type: "INVOICE",
      status: "FINALIZED",
      template: "MINIMAL",
      issueDate: new Date("2026-01-01"),
      subtotal: 5000,
      taxTotal: 900,
      total: 5900,
      recurrenceInterval: "MONTHLY",
      nextRecurrenceAt: new Date("2020-01-01"),
      lines: { create: [{ description: "Consulting", quantity: 1, unitPrice: 5000, taxRate: 18, lineTotal: 5900, sortOrder: 0 }] },
    },
  });
}

async function createOverdueInvoice(businessId: string, customerId: string) {
  await prisma.customer.update({ where: { id: customerId }, data: { email: "customer@example.com" } });
  return prisma.document.create({
    data: {
      businessId,
      customerId,
      type: "INVOICE",
      status: "FINALIZED",
      template: "MINIMAL",
      number: "INV-0001",
      issueDate: new Date("2026-01-01"),
      dueDate: new Date("2020-01-01"),
      subtotal: 5000,
      taxTotal: 900,
      total: 5900,
      lines: { create: [{ description: "Consulting", quantity: 1, unitPrice: 5000, taxRate: 18, lineTotal: 5900, sortOrder: 0 }] },
    },
  });
}

const ACTIVE = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
const LAPSED = new Date(Date.now() - 24 * 60 * 60 * 1000);

describe("runScheduledJobs", () => {
  it("generates due recurring documents for a business with an active trial", async () => {
    const { business, customer } = await createBusiness(ACTIVE);
    await createDueRecurringDocument(business.id, customer.id);

    await runScheduledJobs();

    const drafts = await prisma.document.findMany({ where: { businessId: business.id, status: "DRAFT" } });
    expect(drafts).toHaveLength(1);
  });

  it("skips a business whose trial and subscription have both lapsed", async () => {
    const { business, customer } = await createBusiness(LAPSED);
    await createDueRecurringDocument(business.id, customer.id);

    await runScheduledJobs();

    const drafts = await prisma.document.findMany({ where: { businessId: business.id, status: "DRAFT" } });
    expect(drafts).toHaveLength(0);
  });

  it("still runs for a business whose trial lapsed but has an active paid period", async () => {
    const { business, customer, user } = await createBusiness(LAPSED);
    await prisma.user.update({ where: { id: user.id }, data: { currentPeriodEnd: ACTIVE } });
    await createDueRecurringDocument(business.id, customer.id);

    await runScheduledJobs();

    const drafts = await prisma.document.findMany({ where: { businessId: business.id, status: "DRAFT" } });
    expect(drafts).toHaveLength(1);
  });

  it("sends overdue reminders for an active business", async () => {
    const { business, customer } = await createBusiness(ACTIVE);
    await createOverdueInvoice(business.id, customer.id);

    await runScheduledJobs();

    const [doc] = await prisma.document.findMany({ where: { businessId: business.id } });
    expect(doc.lastReminderSentAt).not.toBeNull();
  });

  it("keeps processing other businesses if one throws", async () => {
    const { business: failingBusiness, customer: failingCustomer } = await createBusiness(ACTIVE);
    await createDueRecurringDocument(failingBusiness.id, failingCustomer.id);
    const { business: okBusiness, customer: okCustomer } = await createBusiness(ACTIVE);
    await createDueRecurringDocument(okBusiness.id, okCustomer.id);

    const real = recurringModule.generateDueRecurringDocuments;
    vi.spyOn(recurringModule, "generateDueRecurringDocuments").mockImplementation(async (businessId) => {
      if (businessId === failingBusiness.id) throw new Error("boom");
      return real(businessId);
    });

    await expect(runScheduledJobs()).resolves.not.toThrow();

    const okDrafts = await prisma.document.findMany({ where: { businessId: okBusiness.id, status: "DRAFT" } });
    expect(okDrafts).toHaveLength(1);

    const logs = await prisma.jobRunLog.findMany({ where: { jobName: "recurring-documents" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].succeeded).toBe(false);
  });

  it("records a job run log entry for each job", async () => {
    await runScheduledJobs();

    const logs = await prisma.jobRunLog.findMany({ orderBy: { ranAt: "asc" } });
    const jobNames = logs.map((l) => l.jobName);
    expect(jobNames).toContain("recurring-documents");
    expect(jobNames).toContain("overdue-reminders");
    expect(jobNames).toContain("quote-expiry-reminders");
    expect(jobNames).toContain("owner-payment-digest");
  });

  it("sends an owner payment digest for an active business", async () => {
    const { business } = await createBusiness(ACTIVE);

    await runScheduledJobs();

    const updated = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    expect(updated.lastDigestSentAt).not.toBeNull();
    expect(mailerModule.sendEmail).toHaveBeenCalled();
  });
});
