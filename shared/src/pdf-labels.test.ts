import { describe, expect, it } from "vitest";
import { getPdfLabels } from "./pdf-labels.js";

describe("getPdfLabels", () => {
  it("returns English labels by default", () => {
    const labels = getPdfLabels("EN");
    expect(labels.typeLabels.INVOICE).toBe("Invoice");
    expect(labels.subtotal).toBe("Subtotal");
    expect(labels.authorizedSignature).toBe("Authorized signature");
  });

  it("returns French labels", () => {
    const labels = getPdfLabels("FR");
    expect(labels.typeLabels.INVOICE).toBe("Facture");
    expect(labels.subtotal).toBe("Sous-total");
    expect(labels.authorizedSignature).toBe("Signature autorisée");
  });

  it("covers every document type in both languages", () => {
    for (const language of ["EN", "FR"] as const) {
      const labels = getPdfLabels(language);
      expect(labels.typeLabels.INVOICE).toBeTruthy();
      expect(labels.typeLabels.PROFORMA).toBeTruthy();
      expect(labels.typeLabels.DELIVERY_NOTE).toBeTruthy();
      expect(labels.typeLabels.QUOTE).toBeTruthy();
      expect(labels.typeLabels.RECEIPT).toBeTruthy();
      expect(labels.typeLabels.CREDIT_NOTE).toBeTruthy();
    }
  });
});

describe("scanToView label", () => {
  it("has wording for both document languages", () => {
    expect(getPdfLabels("EN").scanToView).toBe("Scan to view online");
    expect(getPdfLabels("FR").scanToView).toBe("Scannez pour voir en ligne");
  });
});

describe("payment schedule labels", () => {
  it("has a heading and a step name in both document languages", () => {
    expect(getPdfLabels("EN").paymentSchedule).toBe("Payment schedule");
    expect(getPdfLabels("EN").instalment).toBe("Instalment");
    expect(getPdfLabels("FR").paymentSchedule).toBe("Échéancier de paiement");
    expect(getPdfLabels("FR").instalment).toBe("Échéance");
  });
});
