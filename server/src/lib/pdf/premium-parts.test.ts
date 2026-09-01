import { getPdfLabels } from "@billa/shared";
import { describe, expect, it } from "vitest";
import { buildSignatures, renderAmountInWordsBox, renderFooterBar, renderStatusPill, renderTotalsBox } from "./premium-parts.js";

const EN = getPdfLabels("EN");
const FR = getPdfLabels("FR");

describe("renderStatusPill", () => {
  it("shows Finalized for a finalized document", () => {
    expect(renderStatusPill("FINALIZED", EN)).toContain("Finalized");
  });

  it("shows Draft for a draft document", () => {
    expect(renderStatusPill("DRAFT", EN)).toContain("Draft");
  });

  it("shows the French labels when French labels are passed", () => {
    expect(renderStatusPill("FINALIZED", FR)).toContain("Finalisé");
    expect(renderStatusPill("DRAFT", FR)).toContain("Brouillon");
  });
});

describe("renderTotalsBox", () => {
  it("includes subtotal, tax, and a highlighted total row", () => {
    const html = renderTotalsBox({
      subtotalFormatted: "15,000 RWF",
      taxTotalFormatted: "2,700 RWF",
      totalFormatted: "17,700 RWF",
      dark: "#111111",
      labels: EN,
    });
    expect(html).toContain("15,000 RWF");
    expect(html).toContain("2,700 RWF");
    expect(html).toContain("17,700 RWF");
    expect(html).toContain("background:#111111");
  });

  it("uses French labels when passed", () => {
    const html = renderTotalsBox({
      subtotalFormatted: "15,000 RWF",
      taxTotalFormatted: "2,700 RWF",
      totalFormatted: "17,700 RWF",
      dark: "#111111",
      labels: FR,
    });
    expect(html).toContain("Sous-total");
    expect(html).toContain("Taxe");
  });
});

describe("renderAmountInWordsBox", () => {
  it("includes the amount-in-words label and text", () => {
    const html = renderAmountInWordsBox("Seventeen Thousand Seven Hundred Rwandan Francs Only", EN);
    expect(html).toContain("Amount in words");
    expect(html).toContain("Seventeen Thousand Seven Hundred Rwandan Francs Only");
  });

  it("uses the French label when French labels are passed", () => {
    const html = renderAmountInWordsBox("Dix-sept mille sept cents Francs Rwandais Seulement", FR);
    expect(html).toContain("Montant en lettres");
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
      labels: EN,
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
      labels: EN,
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
      labels: EN,
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
      labels: EN,
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
      labels: EN,
    });
    expect(html).toContain("Dispatched by");
    expect(html).toContain("Received by");
    expect(html.match(/signature-line/g)).toHaveLength(2);
    expect(html).not.toContain("signature-name");
  });

  it("renders the signature image in place of the blank line when provided", () => {
    const html = renderFooterBar({
      business: makeFooterBusiness(),
      dark: "#111111",
      documentNumber: "INV-0001",
      showPaymentInstructions: true,
      signatures: [{ label: "Authorized signature", imageDataUri: "data:image/png;base64,xyz" }],
      labels: EN,
    });
    expect(html).toContain('<img class="signature-image" src="data:image/png;base64,xyz"');
    expect(html).not.toContain("signature-line");
  });

  it("omits missing contact fields without stray separators", () => {
    const html = renderFooterBar({
      business: makeFooterBusiness({ email: null, tin: null, rraEbmNumber: null }),
      dark: "#111111",
      documentNumber: "INV-0001",
      showPaymentInstructions: true,
      signatures: [{ label: "Authorized signature" }],
      labels: EN,
    });
    expect(html).toContain("+250788000000");
    expect(html).not.toContain("null");
  });

  it("uses French labels for payment instructions when French labels are passed", () => {
    const html = renderFooterBar({
      business: makeFooterBusiness({ bankName: "Bank of Kigali", bankAccountNumber: "000123456789" }),
      dark: "#111111",
      documentNumber: "INV-0001",
      showPaymentInstructions: true,
      signatures: [{ label: "Signature autorisée" }],
      labels: FR,
    });
    expect(html).toContain("Instructions de paiement");
    expect(html).toContain("Banque: Bank of Kigali");
    expect(html).toContain("Nom du compte: Kigali Traders");
    expect(html).toContain("Référence: INV-0001");
  });
});

describe("buildSignatures", () => {
  it("returns a single business signature with a fallback label when there's no signatory", () => {
    const signatures = buildSignatures({ signatoryName: null, signatoryTitle: null }, true, EN);
    expect(signatures).toEqual([{ label: "Authorized signature", name: null }]);
  });

  it("uses the signatory's title as the label when set", () => {
    const signatures = buildSignatures({ signatoryName: "Jane Doe", signatoryTitle: "Managing Director" }, true, EN);
    expect(signatures).toEqual([{ label: "Managing Director", name: "Jane Doe" }]);
  });

  it("returns dispatched-by/received-by signatures for a delivery note", () => {
    const signatures = buildSignatures({ signatoryName: "Jane Doe", signatoryTitle: "Managing Director" }, false, EN);
    expect(signatures).toEqual([
      { label: "Dispatched by", name: "Jane Doe" },
      { label: "Received by" },
    ]);
  });

  it("attaches the business's signature image to its own block only, not the customer's", () => {
    const signatures = buildSignatures(
      { signatoryName: "Jane Doe", signatoryTitle: "Managing Director", signatureDataUri: "data:image/png;base64,xyz" },
      false,
      EN,
    );
    expect(signatures).toEqual([
      { label: "Dispatched by", name: "Jane Doe", imageDataUri: "data:image/png;base64,xyz" },
      { label: "Received by" },
    ]);
  });

  it("uses the French fallback label when there's no signatory", () => {
    const signatures = buildSignatures({ signatoryName: null, signatoryTitle: null }, true, FR);
    expect(signatures).toEqual([{ label: "Signature autorisée", name: null }]);
  });

  it("uses French dispatched-by/received-by labels for a delivery note", () => {
    const signatures = buildSignatures({ signatoryName: "Jane Doe", signatoryTitle: null }, false, FR);
    expect(signatures).toEqual([
      { label: "Expédié par", name: "Jane Doe" },
      { label: "Reçu par" },
    ]);
  });
});
