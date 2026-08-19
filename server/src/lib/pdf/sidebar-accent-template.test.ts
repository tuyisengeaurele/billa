import { describe, expect, it } from "vitest";
import { renderSidebarAccentHtml } from "./sidebar-accent-template.js";
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
    ...overrides,
  };
}

describe("renderSidebarAccentHtml", () => {
  it("puts the business contact block and document meta in the sidebar", () => {
    const html = renderSidebarAccentHtml(makeData());
    expect(html).toContain("Kigali Traders");
    expect(html).toContain("EBM-1");
    expect(html).toContain("INV-0001");
  });

  it("renders the customer and line items in the main area", () => {
    const html = renderSidebarAccentHtml(makeData());
    expect(html).toContain("Acme Ltd");
    expect(html).toContain("Printing service");
    expect(html).toContain("17,700 RWF");
  });

  it("shows DRAFT instead of a number when unfinalized", () => {
    const html = renderSidebarAccentHtml(makeData({ number: null, status: "DRAFT" }));
    expect(html).toContain("DRAFT");
  });

  it("picks white sidebar text for a dark accent color", () => {
    const html = renderSidebarAccentHtml(makeData({ business: { ...makeData().business, accentColor: "#111111" } }));
    expect(html).toContain("#FFFFFF");
  });

  it("picks dark sidebar text for a light accent color", () => {
    const html = renderSidebarAccentHtml(makeData({ business: { ...makeData().business, accentColor: "#F5F5F5" } }));
    expect(html).toContain("#1F2937");
  });

  it("uses the dynamic party label instead of a hardcoded one", () => {
    const html = renderSidebarAccentHtml(makeData({ partyLabel: "Deliver to" }));
    expect(html).toContain("Deliver to");
  });

  it("uses the dynamic due date label when both are present", () => {
    const html = renderSidebarAccentHtml(
      makeData({ dueDateLabel: "Valid until", dueDate: "2026-09-01" }),
    );
    expect(html).toContain("Valid until 2026-09-01");
  });

  it("omits the due date line when there is no due date label", () => {
    const html = renderSidebarAccentHtml(makeData({ dueDateLabel: null, dueDate: null }));
    expect(html).not.toMatch(/Due date |Valid until /);
  });
});
