import { describe, expect, it } from "vitest";
import { renderDocumentToHtml } from "./render-document-pdf.js";
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
    lines: [],
    subtotalFormatted: "0 RWF",
    taxTotalFormatted: "0 RWF",
    totalFormatted: "0 RWF",
    ...overrides,
  };
}

describe("renderDocumentToHtml", () => {
  it("dispatches to the minimal template", () => {
    const html = renderDocumentToHtml("MINIMAL", makeData());
    expect(html).toContain("Kigali Traders");
  });

  it("dispatches to the formal template", () => {
    const html = renderDocumentToHtml("FORMAL", makeData());
    expect(html).toContain("letterhead");
  });

  it("dispatches to the sidebar accent template", () => {
    const html = renderDocumentToHtml("SIDEBAR_ACCENT", makeData());
    expect(html).toContain("sidebar");
  });
});
