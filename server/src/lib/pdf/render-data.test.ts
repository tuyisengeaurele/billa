import { describe, expect, it } from "vitest";
import { buildPdfRenderData } from "./render-data.js";
import { Prisma } from "@prisma/client";
import type { Business, Customer, Document, DocumentLine } from "@prisma/client";

const { Decimal } = Prisma;

function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: "biz1",
    name: "Kigali Traders <Ltd>",
    tin: "123",
    industry: null,
    phone: "+250788000000",
    email: "hi@kigali.rw",
    address: "KG 7 Ave",
    logoUrl: null,
    signatureUrl: null,
    primaryColor: "#C2185B",
    accentColors: null,
    rraEbmNumber: "EBM-1",
    bankName: null,
    bankAccountNumber: null,
    signatoryName: null,
    signatoryTitle: null,
    defaultTemplate: "MINIMAL",
    onboardingCompletedAt: null,
    lastDigestSentAt: null,
    ownerId: "u1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDocument(
  overrides: Partial<Document> = {},
): Document & { lines: DocumentLine[]; customer: Customer } {
  return {
    id: "doc1",
    businessId: "biz1",
    type: "INVOICE",
    number: "INV-0001",
    status: "FINALIZED",
    template: "MINIMAL",
    language: "EN",
    customerId: "cust1",
    issueDate: new Date("2026-08-18T00:00:00.000Z"),
    dueDate: null,
    notes: null,
    subtotal: 15000,
    taxTotal: 2700,
    total: 17700,
    sentAt: null,
    publicToken: "token1",
    recurrenceInterval: null,
    recurrenceEndDate: null,
    nextRecurrenceAt: null,
    lastReminderSentAt: null,
    convertedFromId: null,
    referencedDocumentId: null,
    declinedAt: null,
    customerReference: null,
    amountPaid: 0,
    paymentStatus: null,
    writtenOffAt: null,
    writeOffReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    customer: {
      id: "cust1",
      businessId: "biz1",
      name: "Customer & Co",
      tin: null,
      address: null,
      phone: null,
      email: null,
      isActive: true,
      portalToken: "portal-token1",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    lines: [
      {
        id: "line1",
        documentId: "doc1",
        itemId: null,
        description: "Printing service",
        quantity: new Decimal("3.00"),
        unitPrice: 5000,
        taxRate: new Decimal("18.00"),
        discountType: null,
        discountValue: null,
        lineTotal: 15000,
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}

describe("buildPdfRenderData", () => {
  it("escapes user-controlled text fields", async () => {
    const data = await buildPdfRenderData(makeDocument(), makeBusiness());
    expect(data.business.name).toBe("Kigali Traders &lt;Ltd&gt;");
    expect(data.customer.name).toBe("Customer &amp; Co");
  });

  it("formats totals and line amounts with formatRwf", async () => {
    const data = await buildPdfRenderData(makeDocument(), makeBusiness());
    expect(data.subtotalFormatted).toBe("15,000 RWF");
    expect(data.totalFormatted).toBe("17,700 RWF");
    expect(data.lines[0].lineTotalFormatted).toBe("15,000 RWF");
    expect(data.lines[0].quantity).toBe("3");
    expect(data.lines[0].taxRateFormatted).toBe("18%");
  });

  it("falls back to a neutral accent color when the business has none", async () => {
    const data = await buildPdfRenderData(makeDocument(), makeBusiness({ primaryColor: null }));
    expect(data.business.accentColor).toBe("#27272a");
  });

  it("uses the business's own primary color as the accent when set", async () => {
    const data = await buildPdfRenderData(makeDocument(), makeBusiness({ primaryColor: "#C2185B" }));
    expect(data.business.accentColor).toBe("#C2185B");
  });

  it("shows a null number for a draft", async () => {
    const data = await buildPdfRenderData(makeDocument({ number: null, status: "DRAFT" }), makeBusiness());
    expect(data.number).toBeNull();
    expect(data.status).toBe("DRAFT");
  });

  it("resolves a human-readable type label", async () => {
    const data = await buildPdfRenderData(makeDocument({ type: "DELIVERY_NOTE" }), makeBusiness());
    expect(data.typeLabel).toBe("Delivery Note");
  });

  it("returns a null logo when the business has none", async () => {
    const data = await buildPdfRenderData(makeDocument(), makeBusiness({ logoUrl: null }));
    expect(data.business.logoDataUri).toBeNull();
  });

  it("returns a null signature when the business has none", async () => {
    const data = await buildPdfRenderData(makeDocument(), makeBusiness({ signatureUrl: null }));
    expect(data.business.signatureDataUri).toBeNull();
  });

  it("computes the party label and hides the due date label for a delivery note", async () => {
    const data = await buildPdfRenderData(makeDocument({ type: "DELIVERY_NOTE" }), makeBusiness());
    expect(data.partyLabel).toBe("Deliver to");
    expect(data.dueDateLabel).toBeNull();
  });

  it("computes 'Valid until' as the due date label for a quote", async () => {
    const data = await buildPdfRenderData(makeDocument({ type: "QUOTE" }), makeBusiness());
    expect(data.dueDateLabel).toBe("Valid until");
    expect(data.partyLabel).toBe("Bill to");
  });

  it("spells out the total in words for an invoice", async () => {
    const data = await buildPdfRenderData(makeDocument(), makeBusiness());
    expect(data.showTotals).toBe(true);
    expect(data.amountInWordsFormatted).toBe("Seventeen Thousand Seven Hundred Rwandan Francs Only");
  });

  it("uses French labels and amount-in-words for a French-language document", async () => {
    const data = await buildPdfRenderData(makeDocument({ language: "FR" }), makeBusiness());
    expect(data.typeLabel).toBe("Facture");
    expect(data.partyLabel).toBe("Facturé à");
    expect(data.labels.subtotal).toBe("Sous-total");
    expect(data.amountInWordsFormatted).toBe("Dix-sept mille sept cents Francs Rwandais Seulement");
  });

  it("uses the French due-date label for a French-language quote", async () => {
    const data = await buildPdfRenderData(makeDocument({ type: "QUOTE", language: "FR" }), makeBusiness());
    expect(data.dueDateLabel).toBe("Valable jusqu'au");
  });

  it("hides totals and amount-in-words for a delivery note", async () => {
    const data = await buildPdfRenderData(makeDocument({ type: "DELIVERY_NOTE" }), makeBusiness());
    expect(data.showTotals).toBe(false);
    expect(data.amountInWordsFormatted).toBeNull();
  });

  it("passes through bank and signatory details, escaped", async () => {
    const data = await buildPdfRenderData(
      makeDocument(),
      makeBusiness({
        bankName: "Bank of Kigali",
        bankAccountNumber: "000123456789",
        signatoryName: "Jane <Doe>",
        signatoryTitle: "Managing Director",
      }),
    );
    expect(data.business.bankName).toBe("Bank of Kigali");
    expect(data.business.bankAccountNumber).toBe("000123456789");
    expect(data.business.signatoryName).toBe("Jane &lt;Doe&gt;");
    expect(data.business.signatoryTitle).toBe("Managing Director");
  });

  it("leaves bank and signatory details null when unset", async () => {
    const data = await buildPdfRenderData(makeDocument(), makeBusiness());
    expect(data.business.bankName).toBeNull();
    expect(data.business.bankAccountNumber).toBeNull();
    expect(data.business.signatoryName).toBeNull();
    expect(data.business.signatoryTitle).toBeNull();
  });

  it("picks a structural dark color from the logo-extracted accent colors", async () => {
    const data = await buildPdfRenderData(
      makeDocument(),
      makeBusiness({ primaryColor: "#C2185B", accentColors: ["#F5A9C6", "#0D2A4A"] }),
    );
    expect(data.business.darkColor).toBe("#0D2A4A");
  });

  it("falls back to darkening the primary color when there are no accent colors", async () => {
    const data = await buildPdfRenderData(makeDocument(), makeBusiness({ primaryColor: "#F9A8D4", accentColors: null }));
    expect(data.business.darkColor).not.toBe("#F9A8D4");
  });
});
