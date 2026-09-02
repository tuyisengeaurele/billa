import { describe, expect, it } from "vitest";
import {
  buildContactReplyEmail,
  buildDocumentSendEmail,
  buildInviteEmail,
  buildOverdueReminderEmail,
  buildQuoteExpiryReminderEmail,
} from "./email-templates.js";

function assertNoEmDash(html: string) {
  expect(html).not.toContain("—");
}

const BLANK_BUSINESS = {
  businessAddress: null,
  businessPhone: null,
  businessEmail: null,
  businessLogoUrl: null,
};

describe("buildDocumentSendEmail", () => {
  it("writes a warm English email with the customer's name and document details", () => {
    const { subject, html } = buildDocumentSendEmail({
      language: "EN",
      customerName: "Aline Uwase",
      typeLabel: "Invoice",
      number: "INV-0001",
      businessName: "Kigali Traders",
      ...BLANK_BUSINESS,
      sender: null,
      viewUrl: null,
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
      ...BLANK_BUSINESS,
      sender: null,
      viewUrl: null,
    });

    expect(subject).toBe("Facture INV-0001 de Kigali Traders");
    expect(html).toContain("Bonjour Aline Uwase");
    assertNoEmDash(html);
  });

  it("includes the sending business's address, phone, and a hosted logo URL in the footer", () => {
    const { html } = buildDocumentSendEmail({
      language: "EN",
      customerName: "Aline Uwase",
      typeLabel: "Invoice",
      number: "INV-0001",
      businessName: "Kigali Traders",
      businessAddress: "KG 7 Ave, Kigali",
      businessPhone: "+250788000000",
      businessEmail: "hello@kigalitraders.rw",
      businessLogoUrl: "https://api.billa.rw/uploads/b1/logo.png",
      sender: null,
      viewUrl: null,
    });

    expect(html).toContain("KG 7 Ave, Kigali");
    expect(html).toContain("+250788000000");
    expect(html).toContain("hello@kigalitraders.rw");
    expect(html).toContain('src="https://api.billa.rw/uploads/b1/logo.png"');
    expect(html).not.toContain("base64");
  });

  it("includes the sender's own name, phone, and email when provided", () => {
    const { html } = buildDocumentSendEmail({
      language: "EN",
      customerName: "Aline Uwase",
      typeLabel: "Invoice",
      number: "INV-0001",
      businessName: "Kigali Traders",
      ...BLANK_BUSINESS,
      sender: { name: "Jean Mugisha", phone: "+250788111222", email: "jean@kigalitraders.rw" },
      viewUrl: null,
    });

    expect(html).toContain("Jean Mugisha");
    expect(html).toContain("+250788111222");
    expect(html).toContain("jean@kigalitraders.rw");
  });

  it("includes a link to view the document online when a view URL is given", () => {
    const { html } = buildDocumentSendEmail({
      language: "EN",
      customerName: "Aline Uwase",
      typeLabel: "Invoice",
      number: "INV-0001",
      businessName: "Kigali Traders",
      ...BLANK_BUSINESS,
      sender: null,
      viewUrl: "https://billa.rw/view/abc123",
    });

    expect(html).toContain("https://billa.rw/view/abc123");
  });

  it("keeps the HTML small enough to avoid Gmail's clipping limit", () => {
    const { html } = buildDocumentSendEmail({
      language: "EN",
      customerName: "Aline Uwase",
      typeLabel: "Invoice",
      number: "INV-0001",
      businessName: "Kigali Traders",
      businessAddress: "KG 7 Ave, Kigali",
      businessPhone: "+250788000000",
      businessEmail: "hello@kigalitraders.rw",
      businessLogoUrl: "https://api.billa.rw/uploads/b1/logo.png",
      sender: { name: "Jean Mugisha", phone: "+250788111222", email: "jean@kigalitraders.rw" },
      viewUrl: "https://billa.rw/view/abc123",
    });

    // Gmail clips messages once the HTML body passes roughly 102KB.
    expect(Buffer.byteLength(html, "utf8")).toBeLessThan(20_000);
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
      ...BLANK_BUSINESS,
      viewUrl: null,
    });

    expect(subject).toContain("INV-0001");
    expect(html).toContain("2026-08-01");
    expect(html).toContain("Kigali Traders");
    assertNoEmDash(html);
  });
});

describe("buildQuoteExpiryReminderEmail", () => {
  it("mentions the quote number and expiry date in English", () => {
    const { subject, html } = buildQuoteExpiryReminderEmail({
      language: "EN",
      customerName: "Aline Uwase",
      typeLabel: "Quote",
      number: "QUO-0001",
      businessName: "Kigali Traders",
      expiryDate: "2026-09-10",
      ...BLANK_BUSINESS,
      viewUrl: null,
    });

    expect(subject).toContain("QUO-0001");
    expect(html).toContain("Aline Uwase");
    expect(html).toContain("2026-09-10");
    expect(html).toContain("Kigali Traders");
    assertNoEmDash(html);
  });

  it("writes the French version when the document language is FR", () => {
    const { subject, html } = buildQuoteExpiryReminderEmail({
      language: "FR",
      customerName: "Aline Uwase",
      typeLabel: "Devis",
      number: "QUO-0001",
      businessName: "Kigali Traders",
      expiryDate: "2026-09-10",
      ...BLANK_BUSINESS,
      viewUrl: null,
    });

    expect(subject).toContain("QUO-0001");
    expect(html).toContain("Bonjour Aline Uwase");
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
