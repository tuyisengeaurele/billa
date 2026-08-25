import { describe, expect, it } from "vitest";
import {
  accentDark,
  renderAmountInWordsBox,
  renderFooterBar,
  renderStatusPill,
  renderTotalsBox,
} from "./premium-parts.js";

describe("accentDark", () => {
  it("darkens a light accent color enough to contrast with white text", () => {
    const dark = accentDark("#F9A8D4");
    expect(dark).not.toBe("#F9A8D4".toUpperCase());
  });

  it("leaves an already-dark accent color close to itself", () => {
    const dark = accentDark("#1F2937");
    expect(dark).toBe("#1F2937");
  });
});

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

describe("renderFooterBar", () => {
  it("includes contact details joined together", () => {
    const html = renderFooterBar(
      { phone: "+250788000000", email: "hi@kigali.rw", tin: "123", rraEbmNumber: "EBM-1" },
      "#111111",
      ["Authorized signature"],
    );
    expect(html).toContain("+250788000000");
    expect(html).toContain("hi@kigali.rw");
    expect(html).toContain("TIN 123");
    expect(html).toContain("EBM-1");
    expect(html).toContain("Authorized signature");
  });

  it("renders one signature block per label", () => {
    const html = renderFooterBar({ phone: null, email: null, tin: null, rraEbmNumber: null }, "#111111", [
      "Dispatched by",
      "Received by",
    ]);
    expect(html).toContain("Dispatched by");
    expect(html).toContain("Received by");
    expect(html.match(/signature-line/g)).toHaveLength(2);
  });

  it("omits missing contact fields without stray separators", () => {
    const html = renderFooterBar({ phone: "+250788000000", email: null, tin: null, rraEbmNumber: null }, "#111111", [
      "Authorized signature",
    ]);
    expect(html).toContain("+250788000000");
    expect(html).not.toContain("null");
  });
});
