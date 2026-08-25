import { describe, expect, it } from "vitest";
import { renderMinimalHtml } from "./minimal-template.js";
import type { PdfRenderData } from "./render-data.js";

function makeData(overrides: Partial<PdfRenderData> = {}): PdfRenderData {
  return {
    business: {
      name: "Kigali Traders",
      tin: "123",
      address: "KG 7 Ave",
      phone: "+250788000000",
      email: "hi@kigali.rw",
      rraEbmNumber: "EBM-1",
      accentColor: "#C2185B",
      logoDataUri: null,
    },
    customer: { name: "Acme Ltd", tin: null, address: null, phone: null, email: null },
    typeLabel: "Invoice",
    partyLabel: "Bill to",
    dueDateLabel: "Due date",
    number: "INV-0001",
    status: "FINALIZED",
    issueDate: "2026-08-18",
    dueDate: null,
    notes: null,
    lines: [
      {
        description: "Printing service",
        quantity: "3",
        unitPriceFormatted: "5,000 RWF",
        taxRateFormatted: "18%",
        lineTotalFormatted: "15,000 RWF",
      },
    ],
    subtotalFormatted: "15,000 RWF",
    taxTotalFormatted: "2,700 RWF",
    totalFormatted: "17,700 RWF",
    showTotals: true,
    amountInWordsFormatted: "Seventeen Thousand Seven Hundred Rwandan Francs Only",
    ...overrides,
  };
}

describe("renderMinimalHtml", () => {
  it("includes the business name, document type, and number", () => {
    const html = renderMinimalHtml(makeData());
    expect(html).toContain("Kigali Traders");
    expect(html).toContain("Invoice");
    expect(html).toContain("INV-0001");
  });

  it("shows DRAFT instead of a number when unfinalized", () => {
    const html = renderMinimalHtml(makeData({ number: null, status: "DRAFT" }));
    expect(html).toContain("DRAFT");
  });

  it("renders every line item and the totals", () => {
    const html = renderMinimalHtml(makeData());
    expect(html).toContain("Printing service");
    expect(html).toContain("5,000 RWF");
    expect(html).toContain("17,700 RWF");
  });

  it("omits the logo image when there is none", () => {
    const html = renderMinimalHtml(makeData({ business: { ...makeData().business, logoDataUri: null } }));
    expect(html).not.toContain("<img");
  });

  it("renders the logo image when present", () => {
    const html = renderMinimalHtml(
      makeData({ business: { ...makeData().business, logoDataUri: "data:image/png;base64,abc" } }),
    );
    expect(html).toContain('src="data:image/png;base64,abc"');
  });

  it("uses the business accent color for the header rule", () => {
    const html = renderMinimalHtml(makeData({ business: { ...makeData().business, accentColor: "#00FF00" } }));
    expect(html).toContain("#00FF00");
  });

  it("uses the dynamic party label instead of a hardcoded one", () => {
    const html = renderMinimalHtml(makeData({ partyLabel: "Deliver to" }));
    expect(html).toContain("Deliver to");
    expect(html).not.toContain("Bill to");
  });

  it("shows a status pill", () => {
    const html = renderMinimalHtml(makeData({ status: "DRAFT" }));
    expect(html).toContain("Draft");
  });

  it("shows the amount in words when totals are shown", () => {
    const html = renderMinimalHtml(makeData());
    expect(html).toContain("Amount in words");
    expect(html).toContain("Seventeen Thousand Seven Hundred Rwandan Francs Only");
  });

  it("hides totals and amount-in-words for a delivery note, showing two signature lines instead", () => {
    const html = renderMinimalHtml(makeData({ showTotals: false, amountInWordsFormatted: null }));
    expect(html).not.toContain("Amount in words");
    expect(html).not.toContain("Subtotal");
    expect(html).toContain("Dispatched by");
    expect(html).toContain("Received by");
  });
});
