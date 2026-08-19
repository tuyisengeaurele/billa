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
});
