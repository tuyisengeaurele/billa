import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { resetDb } from "../test/db.js";
import { generateDueRecurringDocuments } from "./recurring-documents.js";

beforeEach(resetDb);

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

async function setupBusiness() {
  const user = await createUser();
  const business = await prisma.business.create({
    data: { ownerId: user.id, name: "Kigali Traders", defaultTemplate: "MINIMAL" },
  });
  const customer = await prisma.customer.create({ data: { businessId: business.id, name: "Acme Ltd" } });
  return { business, customer };
}

async function createRecurringDocument(
  businessId: string,
  customerId: string,
  overrides: { nextRecurrenceAt: Date; recurrenceEndDate?: Date | null },
) {
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
      nextRecurrenceAt: overrides.nextRecurrenceAt,
      recurrenceEndDate: overrides.recurrenceEndDate ?? null,
      lines: {
        create: [
          { description: "Consulting", quantity: 1, unitPrice: 5000, taxRate: 18, lineTotal: 5900, sortOrder: 0 },
        ],
      },
    },
  });
}

describe("generateDueRecurringDocuments", () => {
  it("generates a new draft document from a due recurring document and advances nextRecurrenceAt", async () => {
    const { business, customer } = await setupBusiness();
    const due = new Date("2020-01-01");
    const source = await createRecurringDocument(business.id, customer.id, { nextRecurrenceAt: due });

    const generated = await generateDueRecurringDocuments(business.id);

    expect(generated).toHaveLength(1);
    expect(generated[0].status).toBe("DRAFT");
    expect(generated[0].customerId).toBe(customer.id);
    expect(generated[0].total).toBe(5900);
    const lines = await prisma.documentLine.findMany({ where: { documentId: generated[0].id } });
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe("Consulting");

    const updatedSource = await prisma.document.findUniqueOrThrow({ where: { id: source.id } });
    expect(updatedSource.nextRecurrenceAt).not.toBeNull();
    expect(updatedSource.nextRecurrenceAt!.getTime()).toBeGreaterThan(due.getTime());
  });

  it("keeps a line's discount, so the repeat charges the same amount", async () => {
    const { business, customer } = await setupBusiness();
    await prisma.document.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        type: "INVOICE",
        status: "FINALIZED",
        template: "MINIMAL",
        issueDate: new Date("2026-01-01"),
        subtotal: 4500,
        taxTotal: 810,
        total: 5310,
        recurrenceInterval: "MONTHLY",
        nextRecurrenceAt: new Date("2020-01-01"),
        lines: {
          create: [
            {
              description: "Consulting",
              quantity: 1,
              unitPrice: 5000,
              taxRate: 18,
              discountType: "PERCENT",
              discountValue: 10,
              lineTotal: 4500,
              sortOrder: 0,
            },
          ],
        },
      },
    });

    const generated = await generateDueRecurringDocuments(business.id);

    expect(generated[0].total).toBe(5310);
    const line = await prisma.documentLine.findFirstOrThrow({ where: { documentId: generated[0].id } });
    expect(line.discountType).toBe("PERCENT");
    expect(Number(line.discountValue)).toBe(10);
    expect(line.lineTotal).toBe(4500);
  });

  it("keeps the language, customer reference and the payment window of the original", async () => {
    const { business, customer } = await setupBusiness();
    await prisma.document.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        type: "INVOICE",
        status: "FINALIZED",
        template: "MINIMAL",
        language: "FR",
        customerReference: "PO-77",
        issueDate: new Date("2026-01-01"),
        dueDate: new Date("2026-01-31"),
        subtotal: 5000,
        taxTotal: 900,
        total: 5900,
        recurrenceInterval: "MONTHLY",
        nextRecurrenceAt: new Date("2020-03-01T00:00:00.000Z"),
        lines: {
          create: [{ description: "Consulting", quantity: 1, unitPrice: 5000, taxRate: 18, lineTotal: 5000, sortOrder: 0 }],
        },
      },
    });

    const generated = await generateDueRecurringDocuments(business.id);

    expect(generated[0].language).toBe("FR");
    expect(generated[0].customerReference).toBe("PO-77");
    expect(generated[0].dueDate?.toISOString().slice(0, 10)).toBe("2020-03-31");
  });

  it("leaves the due date empty when the original had none", async () => {
    const { business, customer } = await setupBusiness();
    await createRecurringDocument(business.id, customer.id, { nextRecurrenceAt: new Date("2020-01-01") });

    const generated = await generateDueRecurringDocuments(business.id);

    expect(generated[0].dueDate).toBeNull();
  });

  it("does not generate a document that isn't due yet", async () => {
    const { business, customer } = await setupBusiness();
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await createRecurringDocument(business.id, customer.id, { nextRecurrenceAt: future });

    const generated = await generateDueRecurringDocuments(business.id);

    expect(generated).toHaveLength(0);
  });

  it("stops recurring instead of generating once past the recurrence end date", async () => {
    const { business, customer } = await setupBusiness();
    const due = new Date("2020-01-01");
    const pastEnd = new Date("2019-01-01");
    const source = await createRecurringDocument(business.id, customer.id, {
      nextRecurrenceAt: due,
      recurrenceEndDate: pastEnd,
    });

    const generated = await generateDueRecurringDocuments(business.id);

    expect(generated).toHaveLength(0);
    const updatedSource = await prisma.document.findUniqueOrThrow({ where: { id: source.id } });
    expect(updatedSource.recurrenceInterval).toBeNull();
    expect(updatedSource.nextRecurrenceAt).toBeNull();
  });

  it("only generates documents for the given business", async () => {
    const { business: businessA, customer: customerA } = await setupBusiness();
    const otherUser = await createUser();
    const businessB = await prisma.business.create({
      data: { ownerId: otherUser.id, name: "Other Co", defaultTemplate: "MINIMAL" },
    });
    const customerB = await prisma.customer.create({ data: { businessId: businessB.id, name: "Other Customer" } });
    const due = new Date("2020-01-01");
    await createRecurringDocument(businessA.id, customerA.id, { nextRecurrenceAt: due });
    await createRecurringDocument(businessB.id, customerB.id, { nextRecurrenceAt: due });

    const generated = await generateDueRecurringDocuments(businessA.id);

    expect(generated).toHaveLength(1);
  });
});
