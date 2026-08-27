import { describe, expect, it } from "vitest";
import { getDueDateLabel, getPartyLabel } from "./document-labels.js";

describe("getDueDateLabel", () => {
  it("returns 'Due date' for an invoice", () => {
    expect(getDueDateLabel("INVOICE")).toBe("Due date");
  });

  it("returns 'Valid until' for a proforma", () => {
    expect(getDueDateLabel("PROFORMA")).toBe("Valid until");
  });

  it("returns 'Valid until' for a quote", () => {
    expect(getDueDateLabel("QUOTE")).toBe("Valid until");
  });

  it("returns null for a delivery note", () => {
    expect(getDueDateLabel("DELIVERY_NOTE")).toBeNull();
  });

  it("returns null for a receipt", () => {
    expect(getDueDateLabel("RECEIPT")).toBeNull();
  });

  it("returns null for a credit note", () => {
    expect(getDueDateLabel("CREDIT_NOTE")).toBeNull();
  });
});

describe("getPartyLabel", () => {
  it("returns 'Deliver to' for a delivery note", () => {
    expect(getPartyLabel("DELIVERY_NOTE")).toBe("Deliver to");
  });

  it("returns 'Bill to' for an invoice", () => {
    expect(getPartyLabel("INVOICE")).toBe("Bill to");
  });

  it("returns 'Bill to' for a proforma", () => {
    expect(getPartyLabel("PROFORMA")).toBe("Bill to");
  });

  it("returns 'Bill to' for a quote", () => {
    expect(getPartyLabel("QUOTE")).toBe("Bill to");
  });

  it("returns 'Bill to' for a receipt", () => {
    expect(getPartyLabel("RECEIPT")).toBe("Bill to");
  });

  it("returns 'Bill to' for a credit note", () => {
    expect(getPartyLabel("CREDIT_NOTE")).toBe("Bill to");
  });
});
