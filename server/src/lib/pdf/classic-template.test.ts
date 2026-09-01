import { describe, expect, it } from "vitest";
import { renderClassicHtml } from "./classic-template.js";
import { getPdfLabels } from "@billa/shared";
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
    lines: [
      {
        description: "Printing service",
        quantity: "3",
        unitPriceFormatted: "5,000 RWF",
        taxRateFormatted: "18%",
        lineTotalFormatted: "15,000 RWF",
        discountFormatted: null,
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

describe("renderClassicHtml", () => {
  it("includes the business name, document type, and number", () => {
    const html = renderClassicHtml(makeData());
    expect(html).toContain("Kigali Traders");
    expect(html).toContain("Invoice");
    expect(html).toContain("INV-0001");
  });

  it("uses the Lora serif font", () => {
    const html = renderClassicHtml(makeData());
    expect(html).toContain('font-family: "Lora"');
  });

  it("shows DRAFT instead of a number when unfinalized", () => {
    const html = renderClassicHtml(makeData({ number: null, status: "DRAFT" }));
    expect(html).toContain("DRAFT");
  });

  it("renders every line item and the totals", () => {
    const html = renderClassicHtml(makeData());
    expect(html).toContain("Printing service");
    expect(html).toContain("5,000 RWF");
    expect(html).toContain("17,700 RWF");
  });

  it("omits the logo image when there is none", () => {
    const html = renderClassicHtml(makeData({ business: { ...makeData().business, logoDataUri: null } }));
    expect(html).not.toContain("<img");
  });

  it("renders the logo image when present", () => {
    const html = renderClassicHtml(
      makeData({ business: { ...makeData().business, logoDataUri: "data:image/png;base64,abc" } }),
    );
    expect(html).toContain('src="data:image/png;base64,abc"');
  });

  it("renders French labels end-to-end when the document is in French", () => {
    const html = renderClassicHtml(makeData({ labels: getPdfLabels("FR") }));
    expect(html).toContain(">Qté<");
    expect(html).toContain(">Prix unitaire<");
    expect(html).toContain("Sous-total");
  });

  it("renders the signature image in place of the blank line when present", () => {
    const html = renderClassicHtml(
      makeData({ business: { ...makeData().business, signatureDataUri: "data:image/png;base64,sig" } }),
    );
    expect(html).toContain('<img class="signature-image" src="data:image/png;base64,sig"');
    expect(html).not.toContain('class="signature-line"');
  });

  it("uses the business accent color only for the thin rule under the header", () => {
    const html = renderClassicHtml(makeData({ business: { ...makeData().business, accentColor: "#00FF00" } }));
    expect(html).toContain("#00FF00");
  });

  it("does not tint the totals/footer bar with the business accent color", () => {
    const html = renderClassicHtml(makeData({ business: { ...makeData().business, accentColor: "#00FF00" } }));
    expect(html).toContain('<div class="rule" style="background:#00FF00"></div>');
    expect(html).not.toContain('class="totals-row total" style="background:#00FF00"');
    expect(html).not.toContain('class="footer-bar" style="background:#00FF00"');
  });

  it("uses the dynamic party label instead of a hardcoded one", () => {
    const html = renderClassicHtml(makeData({ partyLabel: "Deliver to" }));
    expect(html).toContain("Deliver to");
  });

  it("shows a status pill", () => {
    const html = renderClassicHtml(makeData({ status: "DRAFT" }));
    expect(html).toContain("Draft");
  });

  it("shows the customer reference when set", () => {
    const html = renderClassicHtml(makeData({ customerReference: "PO-4821" }));
    expect(html).toContain("PO-4821");
  });

  it("omits the reference line when there is no customer reference", () => {
    const html = renderClassicHtml(makeData({ customerReference: null }));
    expect(html).not.toContain("Reference:");
  });

  it("gives the totals rows their own layout and legible text on the dark total row", () => {
    // Caught by eye in a browser preview: renderTotalsBox's HTML has no CSS of its
    // own (each template supplies that), and this template's stylesheet had none for
    // .totals-row - the labels/values ran together unspaced, and the dark total row's
    // default-black text was invisible against its own dark background.
    const html = renderClassicHtml(makeData());
    expect(html).toMatch(/\.totals-row\s*\{[^}]*display:\s*flex/);
    expect(html).toMatch(/\.totals-row\.total\s*\{[^}]*color:\s*#fff/);
  });

  it("shows the amount in words when totals are shown", () => {
    const html = renderClassicHtml(makeData());
    expect(html).toContain("Amount in words");
    expect(html).toContain("Seventeen Thousand Seven Hundred Rwandan Francs Only");
  });

  it("hides totals and amount-in-words for a delivery note, showing two signature lines instead", () => {
    const html = renderClassicHtml(makeData({ showTotals: false, amountInWordsFormatted: null }));
    expect(html).not.toContain("Amount in words");
    expect(html).toContain("Dispatched by");
    expect(html).toContain("Received by");
  });

  it("shows payment instructions with the bank details when set", () => {
    const html = renderClassicHtml(
      makeData({
        business: { ...makeData().business, bankName: "Bank of Kigali", bankAccountNumber: "000123456789" },
      }),
    );
    expect(html).toContain("Payment instructions");
    expect(html).toContain("Bank of Kigali");
  });

  it("shows the signatory's name and title when set", () => {
    const html = renderClassicHtml(
      makeData({
        business: { ...makeData().business, signatoryName: "Jane Doe", signatoryTitle: "Managing Director" },
      }),
    );
    expect(html).toContain("Jane Doe");
    expect(html).toContain("Managing Director");
  });
});
