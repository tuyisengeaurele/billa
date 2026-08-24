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
