import { describe, expect, it } from "vitest";
import { buildSignatures, renderAmountInWordsBox, renderFooterBar, renderStatusPill, renderTotalsBox } from "./premium-parts.js";

describe("renderStatusPill", () => {
  it("shows Finalized for a finalized document", () => {
    expect(renderStatusPill("FINALIZED")).toContain("Finalized");
  });

  it("shows Draft for a draft document", () => {
    expect(renderStatusPill("DRAFT")).toContain("Draft");
  });
});

describe("renderTotalsBox", () => {
  it("includes subtotal, tax, and a highlighted total row", () => {
    const html = renderTotalsBox({
      subtotalFormatted: "15,000 RWF",
      taxTotalFormatted: "2,700 RWF",
      totalFormatted: "17,700 RWF",
      dark: "#111111",
    });
    expect(html).toContain("15,000 RWF");
    expect(html).toContain("2,700 RWF");
    expect(html).toContain("17,700 RWF");
    expect(html).toContain("background:#111111");
  });
});

describe("renderAmountInWordsBox", () => {
  it("includes the amount-in-words label and text", () => {
    const html = renderAmountInWordsBox("Seventeen Thousand Seven Hundred Rwandan Francs Only");
    expect(html).toContain("Amount in words");
    expect(html).toContain("Seventeen Thousand Seven Hundred Rwandan Francs Only");
  });
});

function makeFooterBusiness(overrides: Partial<Parameters<typeof renderFooterBar>[0]["business"]> = {}) {
  return {
    name: "Kigali Traders",
    phone: "+250788000000",
    email: "hi@kigali.rw",
    tin: "123",
    rraEbmNumber: "EBM-1",
    bankName: null,
    bankAccountNumber: null,
    ...overrides,
  };
}

describe("renderFooterBar", () => {
  it("shows payment instructions with the account name and reference when bank details are set and requested", () => {
    const html = renderFooterBar({
      business: makeFooterBusiness({ bankName: "Bank of Kigali", bankAccountNumber: "000123456789" }),
      dark: "#111111",
      documentNumber: "INV-0001",
      showPaymentInstructions: true,
      signatures: [{ label: "Authorized signature" }],
    });
    expect(html).toContain("Payment instructions");
    expect(html).toContain("Bank of Kigali");
    expect(html).toContain("000123456789");
    expect(html).toContain("Account name: Kigali Traders");
    expect(html).toContain("Reference: INV-0001");
  });

  it("falls back to contact details when no bank details are set", () => {
    const html = renderFooterBar({
      business: makeFooterBusiness(),
      dark: "#111111",
      documentNumber: "INV-0001",
      showPaymentInstructions: true,
      signatures: [{ label: "Authorized signature" }],
    });
    expect(html).not.toContain("Payment instructions");
    expect(html).toContain("+250788000000");
    expect(html).toContain("hi@kigali.rw");
  });

  it("shows contact details instead of payment instructions when payment instructions aren't requested", () => {
    const html = renderFooterBar({
      business: makeFooterBusiness({ bankName: "Bank of Kigali", bankAccountNumber: "000123456789" }),
      dark: "#111111",
      documentNumber: "DN-0001",
      showPaymentInstructions: false,
      signatures: [{ label: "Dispatched by" }, { label: "Received by" }],
    });
    expect(html).not.toContain("Payment instructions");
    expect(html).toContain("+250788000000");
  });

  it("shows a signatory's name above their label when provided", () => {
    const html = renderFooterBar({
      business: makeFooterBusiness(),
      dark: "#111111",
      documentNumber: "INV-0001",
      showPaymentInstructions: true,
      signatures: [{ label: "Managing Director", name: "Jane Doe" }],
    });
    expect(html).toContain("Jane Doe");
    expect(html).toContain("Managing Director");
  });

  it("renders one signature block per entry without a name when none is given", () => {
    const html = renderFooterBar({
      business: makeFooterBusiness(),
      dark: "#111111",
      documentNumber: "DN-0001",
      showPaymentInstructions: false,
      signatures: [{ label: "Dispatched by" }, { label: "Received by" }],
    });
    expect(html).toContain("Dispatched by");
    expect(html).toContain("Received by");
    expect(html.match(/signature-line/g)).toHaveLength(2);
    expect(html).not.toContain("signature-name");
  });

  it("omits missing contact fields without stray separators", () => {
    const html = renderFooterBar({
      business: makeFooterBusiness({ email: null, tin: null, rraEbmNumber: null }),
      dark: "#111111",
      documentNumber: "INV-0001",
      showPaymentInstructions: true,
      signatures: [{ label: "Authorized signature" }],
    });
    expect(html).toContain("+250788000000");
    expect(html).not.toContain("null");
  });
});

describe("buildSignatures", () => {
  it("returns a single business signature with a fallback label when there's no signatory", () => {
    const signatures = buildSignatures({ signatoryName: null, signatoryTitle: null }, true);
    expect(signatures).toEqual([{ label: "Authorized signature", name: null }]);
  });

  it("uses the signatory's title as the label when set", () => {
    const signatures = buildSignatures({ signatoryName: "Jane Doe", signatoryTitle: "Managing Director" }, true);
    expect(signatures).toEqual([{ label: "Managing Director", name: "Jane Doe" }]);
  });

  it("returns dispatched-by/received-by signatures for a delivery note", () => {
    const signatures = buildSignatures({ signatoryName: "Jane Doe", signatoryTitle: "Managing Director" }, false);
    expect(signatures).toEqual([
      { label: "Dispatched by", name: "Jane Doe" },
      { label: "Received by" },
    ]);
  });
});
