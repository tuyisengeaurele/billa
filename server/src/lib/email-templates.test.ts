import { describe, expect, it } from "vitest";
import {
  buildContactReplyEmail,
  buildDocumentSendEmail,
  buildInviteEmail,
  buildOverdueReminderEmail,
} from "./email-templates.js";

function assertNoEmDash(html: string) {
  expect(html).not.toContain("—");
}

describe("buildDocumentSendEmail", () => {
  it("writes a warm English email with the customer's name and document details", () => {
    const { subject, html } = buildDocumentSendEmail({
      language: "EN",
      customerName: "Aline Uwase",
      typeLabel: "Invoice",
      number: "INV-0001",
      businessName: "Kigali Traders",
      businessAddress: null,
      businessPhone: null,
      businessEmail: null,
      businessLogoDataUri: null,
    });

    expect(subject).toBe("Invoice INV-0001 from Kigali Traders");
    expect(html).toContain("Aline Uwase");
    expect(html).toContain("Kigali Traders");
    expect(html).toContain("INV-0001");
    assertNoEmDash(html);
  });

  it("writes the French version when the document language is FR", () => {
    const { subject, html } = buildDocumentSendEmail({
      language: "FR",
      customerName: "Aline Uwase",
      typeLabel: "Facture",
      number: "INV-0001",
      businessName: "Kigali Traders",
      businessAddress: null,
      businessPhone: null,
      businessEmail: null,
      businessLogoDataUri: null,
    });

    expect(subject).toBe("Facture INV-0001 de Kigali Traders");
    expect(html).toContain("Bonjour Aline Uwase");
    assertNoEmDash(html);
  });

  it("includes the sending business's address, phone, and logo in the footer", () => {
    const { html } = buildDocumentSendEmail({
      language: "EN",
      customerName: "Aline Uwase",
      typeLabel: "Invoice",
      number: "INV-0001",
      businessName: "Kigali Traders",
      businessAddress: "KG 7 Ave, Kigali",
      businessPhone: "+250788000000",
      businessEmail: "hello@kigalitraders.rw",
      businessLogoDataUri: "data:image/png;base64,abc123",
    });

    expect(html).toContain("KG 7 Ave, Kigali");
    expect(html).toContain("+250788000000");
    expect(html).toContain("hello@kigalitraders.rw");
    expect(html).toContain("data:image/png;base64,abc123");
  });
});

describe("buildOverdueReminderEmail", () => {
  it("mentions the invoice number and due date", () => {
    const { subject, html } = buildOverdueReminderEmail({
      language: "EN",
      customerName: "Aline Uwase",
      number: "INV-0001",
      businessName: "Kigali Traders",
      dueDate: "2026-08-01",
      businessAddress: null,
      businessPhone: null,
      businessEmail: null,
      businessLogoDataUri: null,
    });

    expect(subject).toContain("INV-0001");
    expect(html).toContain("2026-08-01");
    expect(html).toContain("Kigali Traders");
    assertNoEmDash(html);
  });
});

describe("buildContactReplyEmail", () => {
  it("quotes the original message and includes the reply", () => {
    const { subject, html } = buildContactReplyEmail({
      recipientName: "Aline",
      originalMessage: "How do I add my TIN number?",
      replyMessage: "You can add it from Business settings, under Business details.",
    });

    expect(subject).toBe("Re: your message to Billa");
    expect(html).toContain("How do I add my TIN number?");
    expect(html).toContain("Business settings");
    assertNoEmDash(html);
  });
});

describe("buildInviteEmail", () => {
  it("includes the business name and accept link", () => {
    const { subject, html } = buildInviteEmail({
      businessName: "Kigali Traders",
      link: "https://billa.rw/invites/abc123",
    });

    expect(subject).toContain("Kigali Traders");
    expect(html).toContain("https://billa.rw/invites/abc123");
    assertNoEmDash(html);
  });
});
