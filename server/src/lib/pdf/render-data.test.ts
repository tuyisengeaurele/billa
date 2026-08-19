import { Decimal } from "@prisma/client/runtime/library";
import { describe, expect, it } from "vitest";
import { buildPdfRenderData } from "./render-data.js";
import type { Business, Customer, Document, DocumentLine } from "@prisma/client";

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
    primaryColor: "#C2185B",
    accentColors: null,
    rraEbmNumber: "EBM-1",
    defaultTemplate: "MINIMAL",
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
    customerId: "cust1",
    issueDate: new Date("2026-08-18T00:00:00.000Z"),
    dueDate: null,
    notes: null,
    subtotal: 15000,
    taxTotal: 2700,
    total: 17700,
    convertedFromId: null,
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
});
