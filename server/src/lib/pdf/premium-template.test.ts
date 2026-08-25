import { describe, expect, it } from "vitest";
import { renderPremiumHtml } from "./premium-template.js";
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

describe("renderPremiumHtml", () => {
  it("includes the business and customer blocks in bordered boxes", () => {
    const html = renderPremiumHtml(makeData());
    expect(html).toContain("Kigali Traders");
    expect(html).toContain("Acme Ltd");
    expect(html).toContain("border");
  });

  it("shows both issue date and due date when present", () => {
    const html = renderPremiumHtml(makeData());
    expect(html).toContain("2026-08-18");
    expect(html).toContain("2026-09-01");
  });

  it("shows DRAFT instead of a number when unfinalized", () => {
    const html = renderPremiumHtml(makeData({ number: null, status: "DRAFT" }));
    expect(html).toContain("DRAFT");
  });

  it("renders the line-item table, numbered", () => {
    const html = renderPremiumHtml(makeData());
    expect(html).toContain("Printing service");
    expect(html).toContain(">01<");
  });

  it("uses the business accent color for the doc title", () => {
    const html = renderPremiumHtml(makeData({ business: { ...makeData().business, accentColor: "#00FF00" } }));
    expect(html).toContain("#00FF00");
  });

  it("uses the dynamic party label instead of a hardcoded one", () => {
    const html = renderPremiumHtml(makeData({ partyLabel: "Deliver to" }));
    expect(html).toContain("Deliver to");
  });

  it("uses the dynamic due date label when both are present", () => {
    const html = renderPremiumHtml(makeData({ dueDateLabel: "Valid until", dueDate: "2026-09-01" }));
    expect(html).toContain("Valid until: 2026-09-01");
    expect(html).not.toContain("Due:");
  });

  it("omits the due date line when there is no due date label", () => {
    const html = renderPremiumHtml(makeData({ dueDateLabel: null, dueDate: null }));
    expect(html).not.toMatch(/Due date:|Valid until:/);
  });

  it("shows a status pill", () => {
    const html = renderPremiumHtml(makeData({ status: "FINALIZED" }));
    expect(html).toContain("Finalized");
  });

  it("shows the amount in words when totals are shown", () => {
    const html = renderPremiumHtml(makeData());
    expect(html).toContain("Amount in words");
    expect(html).toContain("Seventeen Thousand Seven Hundred Rwandan Francs Only");
  });

  it("hides totals and amount-in-words for a delivery note, showing two signature lines instead", () => {
    const html = renderPremiumHtml(makeData({ showTotals: false, amountInWordsFormatted: null }));
    expect(html).not.toContain("Amount in words");
    expect(html).not.toContain("Subtotal");
    expect(html).toContain("Dispatched by");
    expect(html).toContain("Received by");
  });

  it("shows one signature line when totals are shown", () => {
    const html = renderPremiumHtml(makeData());
    expect(html).toContain("Authorized signature");
    expect(html).not.toContain("Dispatched by");
  });

  it("darkens the accent color for the table header instead of using it raw", () => {
    const html = renderPremiumHtml(makeData({ business: { ...makeData().business, accentColor: "#F9A8D4" } }));
    expect(html).not.toContain("background:#F9A8D4");
  });

  it("shows payment instructions with the bank details when set", () => {
    const html = renderPremiumHtml(
      makeData({
        business: { ...makeData().business, bankName: "Bank of Kigali", bankAccountNumber: "000123456789" },
      }),
    );
    expect(html).toContain("Payment instructions");
    expect(html).toContain("Bank of Kigali");
    expect(html).toContain("000123456789");
    expect(html).toContain("Reference: INV-0001");
  });

  it("falls back to contact details in the footer when there are no bank details", () => {
    const html = renderPremiumHtml(makeData());
    expect(html).not.toContain("Payment instructions");
    expect(html).toContain("+250788000000");
  });

  it("shows the signatory's name and title when set", () => {
    const html = renderPremiumHtml(
      makeData({
        business: { ...makeData().business, signatoryName: "Jane Doe", signatoryTitle: "Managing Director" },
      }),
    );
    expect(html).toContain("Jane Doe");
    expect(html).toContain("Managing Director");
  });

  it("includes a disclaimer footer naming the business", () => {
    const html = renderPremiumHtml(makeData());
    expect(html).toContain("issued by Kigali Traders");
  });

  it("shows a From (Seller) / To (Buyer) panel with the seller's own details", () => {
    const html = renderPremiumHtml(
      makeData({
        business: { ...makeData().business, bankName: "Bank of Kigali", bankAccountNumber: "000123456789" },
        customer: { name: "Acme Ltd", tin: "999", address: "KN 1 Rd", phone: "+250788111222", email: null },
      }),
    );
    expect(html).toContain("From (Seller)");
    expect(html).toContain("Bill to (Buyer)");
    expect(html).toContain("Bank:");
    expect(html).toContain("Bank of Kigali");
    expect(html).toContain("Acc. no:");
    expect(html).toContain("000123456789");
    expect(html).toContain("KN 1 Rd");
    expect(html).toContain("+250788111222");
    expect(html).toContain("Currency:");
    expect(html).toContain("RWF (Rwandan Franc)");
  });

  it("omits seller bank rows from the panel when there are no bank details", () => {
    const html = renderPremiumHtml(makeData());
    expect(html).not.toContain("Bank:");
    expect(html).not.toContain("Acc. no:");
  });

  it("restates the total numerically alongside the amount in words", () => {
    const html = renderPremiumHtml(makeData());
    expect(html).toContain("Seventeen Thousand Seven Hundred Rwandan Francs Only (17,700 RWF)");
  });
});
