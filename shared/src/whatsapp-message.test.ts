import { describe, expect, it } from "vitest";
import { buildWhatsAppLink, buildWhatsAppMessage } from "./whatsapp-message.js";

const base = {
  customerName: "Jean",
  businessName: "Kigali Supplies",
  type: "INVOICE" as const,
  number: "INV-0007",
  amount: 125000,
  dueDate: "2026-10-15T00:00:00.000Z",
  viewUrl: "https://billa.example/view/abc",
};

describe("buildWhatsAppMessage", () => {
  it("shares an invoice with its amount, due date and link", () => {
    const message = buildWhatsAppMessage({ ...base, kind: "share" });
    expect(message).toBe(
      "Hello Jean, Kigali Supplies sent you invoice INV-0007 for 125,000 RWF.\nDue date: 15 Oct 2026.\nView it here: https://billa.example/view/abc",
    );
  });

  it("uses the valid until wording for a quote", () => {
    const message = buildWhatsAppMessage({ ...base, kind: "share", type: "QUOTE", number: "QUO-0002" });
    expect(message).toContain("quote QUO-0002");
    expect(message).toContain("Valid until: 15 Oct 2026.");
  });

  it("leaves the date line out when there is no date", () => {
    const message = buildWhatsAppMessage({ ...base, kind: "share", type: "RECEIPT", dueDate: null });
    expect(message).not.toContain("Due date");
    expect(message).not.toContain("Valid until");
  });

  it("asks for the amount still owed in a reminder", () => {
    const message = buildWhatsAppMessage({ ...base, kind: "reminder", amount: 40000 });
    expect(message).toBe(
      "Hello Jean, a reminder from Kigali Supplies that invoice INV-0007 has 40,000 RWF outstanding.\nDue date: 15 Oct 2026.\nView and pay it here: https://billa.example/view/abc",
    );
  });

  it("invites the customer to pay when the invoice can be paid online", () => {
    const message = buildWhatsAppMessage({ ...base, kind: "share", payable: true });
    expect(message).toContain("View and pay it here: https://billa.example/view/abc");
  });

  it("does not offer payment for a quote even when the business takes MoMo", () => {
    const message = buildWhatsAppMessage({ ...base, kind: "share", type: "QUOTE", payable: true });
    expect(message).toContain("View it here:");
  });

  it("calls a draft without a number by its type only", () => {
    const message = buildWhatsAppMessage({ ...base, kind: "share", number: null });
    expect(message).toContain("sent you invoice for");
  });
});

describe("buildWhatsAppLink", () => {
  it("builds a wa.me link with the message encoded", () => {
    expect(buildWhatsAppLink("0788123456", "Hi there\nbye")).toBe("https://wa.me/250788123456?text=Hi%20there%0Abye");
  });

  it("returns null when the phone cannot be used", () => {
    expect(buildWhatsAppLink("", "Hi")).toBeNull();
    expect(buildWhatsAppLink(null, "Hi")).toBeNull();
  });
});
