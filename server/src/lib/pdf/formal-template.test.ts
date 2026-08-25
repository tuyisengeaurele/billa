import { describe, expect, it } from "vitest";
import { renderFormalHtml } from "./formal-template.js";
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
    dueDate: "2026-09-01",
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

describe("renderFormalHtml", () => {
  it("includes the business and customer blocks in bordered boxes", () => {
    const html = renderFormalHtml(makeData());
    expect(html).toContain("Kigali Traders");
    expect(html).toContain("Acme Ltd");
    expect(html).toContain("border");
  });

  it("shows both issue date and due date when present", () => {
    const html = renderFormalHtml(makeData());
    expect(html).toContain("2026-08-18");
    expect(html).toContain("2026-09-01");
  });

  it("shows DRAFT instead of a number when unfinalized", () => {
    const html = renderFormalHtml(makeData({ number: null, status: "DRAFT" }));
    expect(html).toContain("DRAFT");
  });

  it("renders the line-item table with visible grid lines", () => {
    const html = renderFormalHtml(makeData());
    expect(html).toContain("Printing service");
    expect(html).toMatch(/border[^;]*;/);
  });

  it("uses the business accent color for the header strip", () => {
    const html = renderFormalHtml(makeData({ business: { ...makeData().business, accentColor: "#00FF00" } }));
    expect(html).toContain("#00FF00");
  });

  it("uses the dynamic party label instead of a hardcoded one", () => {
    const html = renderFormalHtml(makeData({ partyLabel: "Deliver to" }));
    expect(html).toContain("Deliver to");
  });

  it("uses the dynamic due date label when both are present", () => {
    const html = renderFormalHtml(
      makeData({ dueDateLabel: "Valid until", dueDate: "2026-09-01" }),
    );
    expect(html).toContain("Valid until: 2026-09-01");
    expect(html).not.toContain("Due:");
  });

  it("omits the due date line when there is no due date label", () => {
    const html = renderFormalHtml(makeData({ dueDateLabel: null, dueDate: null }));
    expect(html).not.toMatch(/Due date:|Valid until:/);
  });

  it("shows a status pill", () => {
    const html = renderFormalHtml(makeData({ status: "FINALIZED" }));
    expect(html).toContain("Finalized");
  });

  it("shows the amount in words when totals are shown", () => {
    const html = renderFormalHtml(makeData());
    expect(html).toContain("Amount in words");
    expect(html).toContain("Seventeen Thousand Seven Hundred Rwandan Francs Only");
  });

  it("hides totals and amount-in-words for a delivery note, showing two signature lines instead", () => {
    const html = renderFormalHtml(makeData({ showTotals: false, amountInWordsFormatted: null }));
    expect(html).not.toContain("Amount in words");
    expect(html).not.toContain("Subtotal");
    expect(html).toContain("Dispatched by");
    expect(html).toContain("Received by");
  });

  it("shows one signature line when totals are shown", () => {
    const html = renderFormalHtml(makeData());
    expect(html).toContain("Authorized signature");
    expect(html).not.toContain("Dispatched by");
  });

  it("darkens the accent color for the table header instead of using it raw", () => {
    const html = renderFormalHtml(makeData({ business: { ...makeData().business, accentColor: "#F9A8D4" } }));
    expect(html).not.toContain("background:#F9A8D4");
  });
});
