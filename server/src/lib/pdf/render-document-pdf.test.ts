import { describe, expect, it } from "vitest";
import { renderDocumentToHtml } from "./render-document-pdf.js";
import { getPdfLabels } from "@billa/shared";
import type { PdfRenderData } from "./render-data.js";

function makeData(overrides: Partial<PdfRenderData> = {}): PdfRenderData {
  return {
    business: {
      name: "Kigali Traders",
      tin: null,
      address: null,
      phone: null,
      email: null,
      rraEbmNumber: null,
      accentColor: "#C2185B",
      darkColor: "#111111",
      bankName: null,
      bankAccountNumber: null,
      signatoryName: null,
      signatoryTitle: null,
      logoDataUri: null,
      signatureDataUri: null,
    },
    customer: { name: "Acme Ltd", tin: null, address: null, phone: null, email: null },
    typeLabel: "Invoice",
    labels: getPdfLabels("EN"),
    partyLabel: "Bill to",
    dueDateLabel: "Due date",
    number: "INV-0001",
    status: "FINALIZED",
    issueDate: "2026-08-18",
    dueDate: null,
    notes: null,
    customerReference: null,
    lines: [],
    subtotalFormatted: "0 RWF",
    taxTotalFormatted: "0 RWF",
    totalFormatted: "0 RWF",
    showTotals: true,
    amountInWordsFormatted: "Zero Rwandan Francs Only",
    ...overrides,
  };
}

describe("renderDocumentToHtml", () => {
  it("dispatches to the minimal template", () => {
    const html = renderDocumentToHtml("MINIMAL", makeData());
    expect(html).toContain("Kigali Traders");
  });

  it("dispatches to the premium template", () => {
    const html = renderDocumentToHtml("PREMIUM", makeData());
    expect(html).toContain("From (Seller)");
  });

  it("dispatches to the classic template", () => {
    const html = renderDocumentToHtml("CLASSIC", makeData());
    expect(html).toContain("Kigali Traders");
    expect(html).toContain('font-family: "Lora"');
  });
});
