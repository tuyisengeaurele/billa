import { afterEach, describe, expect, it } from "vitest";
import {
  buildContactReplyEmail,
  buildDocumentSendEmail,
  buildInviteEmail,
  buildOverdueReminderEmail,
  buildQuoteExpiryReminderEmail,
  buildStatementEmail,
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

describe("email header branding", () => {
  afterEach(() => {
    delete process.env.RENDER_EXTERNAL_URL;
    delete process.env.API_URL;
  });

  it("includes Billa's own logo in the header, from a hosted URL", () => {
    // Regression test: emails used to be a bare "Billa" wordmark with no mark
    // at all, on every template - this checks the shell all of them share.
    const { html } = buildContactReplyEmail({
      recipientName: "Aline",
      originalMessage: "How do I add my TIN number?",
      replyMessage: "You can add it from Business settings.",
    });

    expect(html).toMatch(/<img src="https?:\/\/[^"]+\/logo\.png"/);
    expect(html).not.toContain("base64");
  });

  it("uses RENDER_EXTERNAL_URL for the logo, not a manually-set API_URL that may be stale or unset", () => {
    // Regression test: this used to read API_URL directly, which is never set
    // automatically - the logo silently pointed at an unreachable localhost
    // URL in production until someone remembered to fill it in.
    process.env.RENDER_EXTERNAL_URL = "https://billa-api-og7v.onrender.com";
    process.env.API_URL = "https://api.billa.rw";

    const { html } = buildContactReplyEmail({
      recipientName: "Aline",
      originalMessage: "Hi",
      replyMessage: "Hi back",
    });

    expect(html).toContain('src="https://billa-api-og7v.onrender.com/logo.png"');
  });
});

describe("buildDueSoonReminderEmail", () => {
  const base = {
    language: "EN" as const,
    customerName: "Aline <Uwase>",
    number: "INV-0007",
    businessName: "Kigali Traders",
    dueDate: "2026-10-15",
    amount: 40000,
    ...BLANK_BUSINESS,
    viewUrl: "https://billa.example/view/abc",
  };

  it("says which invoice is due, when, and for how much", async () => {
    const { buildDueSoonReminderEmail } = await import("./email-templates.js");
    const { subject, html } = buildDueSoonReminderEmail(base);

    expect(subject).toBe("INV-0007 is due on 2026-10-15");
    expect(html).toContain("40,000 RWF");
    expect(html).toContain("Aline &lt;Uwase&gt;");
  });

  it("names the instalment when the invoice is on a payment plan, in its currency", async () => {
    const { buildDueSoonReminderEmail } = await import("./email-templates.js");
    const { html } = buildDueSoonReminderEmail({
      ...base,
      amount: 12550,
      currency: "USD",
      isInstallment: true,
      installmentLabel: "Deposit",
    });

    expect(html).toContain("the Deposit instalment of 125.50 USD");
  });

  it("is available in French", async () => {
    const { buildDueSoonReminderEmail } = await import("./email-templates.js");
    const { subject, html } = buildDueSoonReminderEmail({ ...base, language: "FR" });

    expect(subject).toBe("INV-0007 arrive à échéance le 2026-10-15");
    expect(html).toContain("Un petit rappel");
  });
});

describe("buildStatementEmail", () => {
  const base = {
    customerName: "Aline <Uwase>",
    businessName: "Kigali Traders",
    ...BLANK_BUSINESS,
    sender: null,
    portalUrl: "https://billa.example/portal/abc",
    invoices: [
      { number: "INV-0001", dueDate: "2026-09-01", amountOwed: 40000 },
      { number: "INV-0002", dueDate: null, amountOwed: 12500 },
    ],
  };

  it("shows each invoice in its own currency and totals each currency on its own", () => {
    const { html } = buildStatementEmail({
      ...base,
      invoices: [
        { number: "INV-0001", dueDate: null, amountOwed: 40000 },
        { number: "INV-0002", dueDate: null, amountOwed: 12550, currency: "USD" as const },
        { number: "INV-0003", dueDate: null, amountOwed: 1000 },
      ],
    });

    expect(html).toContain("125.50 USD");
    expect(html).toContain("41,000 RWF + 125.50 USD");
  });

  it("lists each open invoice and the total owed", () => {
    const { subject, html } = buildStatementEmail(base);

    expect(subject).toBe("Your statement from Kigali Traders");
    expect(html).toContain("INV-0001");
    expect(html).toContain("40,000 RWF");
    expect(html).toContain("INV-0002");
    expect(html).toContain("52,500 RWF");
    expect(html).toContain("1 Sep 2026");
  });

  it("links to the customer's portal", () => {
    expect(buildStatementEmail(base).html).toContain('href="https://billa.example/portal/abc"');
  });

  it("only mentions paying when the customer can pay online", () => {
    expect(buildStatementEmail(base).html).toContain(">View online<");
    expect(buildStatementEmail({ ...base, payable: true }).html).toContain(">View and pay online<");
  });

  it("escapes the customer's name", () => {
    const { html } = buildStatementEmail(base);
    expect(html).toContain("Aline &lt;Uwase&gt;");
    expect(html).not.toContain("Aline <Uwase>");
  });

  it("uses no em dashes", () => {
    assertNoEmDash(buildStatementEmail(base).html);
  });
});

describe("view link button", () => {
  const send = {
    customerName: "Aline Uwase",
    typeLabel: "Invoice",
    number: "INV-0001",
    businessName: "Kigali Traders",
    ...BLANK_BUSINESS,
    sender: null,
    viewUrl: "https://billa.example/view/abc",
  };
  const reminder = {
    customerName: "Aline Uwase",
    number: "INV-0001",
    businessName: "Kigali Traders",
    dueDate: "2026-09-01",
    ...BLANK_BUSINESS,
    viewUrl: "https://billa.example/view/abc",
  };

  it("says View online when the customer cannot pay from the page", () => {
    expect(buildDocumentSendEmail({ ...send, language: "EN" }).html).toContain(">View online<");
    expect(buildOverdueReminderEmail({ ...reminder, language: "EN" }).html).toContain(">View online<");
  });

  it("says View and pay online when the page takes payment", () => {
    expect(buildDocumentSendEmail({ ...send, language: "EN", payable: true }).html).toContain(">View and pay online<");
    expect(buildOverdueReminderEmail({ ...reminder, language: "EN", payable: true }).html).toContain(
      ">View and pay online<",
    );
  });

  it("uses French wording in a French email", () => {
    expect(buildDocumentSendEmail({ ...send, language: "FR" }).html).toContain(">Voir en ligne<");
    expect(buildDocumentSendEmail({ ...send, language: "FR", payable: true }).html).toContain(
      ">Voir et payer en ligne<",
    );
  });
});

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

describe("buildOverdueReminderEmail for an instalment", () => {
  const base = {
    customerName: "Aline Uwase",
    number: "INV-0009",
    businessName: "Kigali Traders",
    dueDate: "2026-10-01",
    ...BLANK_BUSINESS,
    viewUrl: null,
  };

  it("names the instalment and how much of it is late", () => {
    const { html } = buildOverdueReminderEmail({ ...base, language: "EN", installment: { label: "Deposit", amount: 40000 } });
    expect(html).toContain("Deposit instalment of 40,000 RWF");
    expect(html).toContain("2026-10-01");
  });

  it("says just an instalment when it has no name", () => {
    const { html } = buildOverdueReminderEmail({ ...base, language: "EN", installment: { label: null, amount: 40000 } });
    expect(html).toContain("an instalment of 40,000 RWF");
  });

  it("has a French wording too", () => {
    const { html } = buildOverdueReminderEmail({ ...base, language: "FR", installment: { label: "Acompte", amount: 40000 } });
    expect(html).toContain("l'échéance Acompte de 40,000 RWF");
  });

  it("keeps the whole-invoice wording when there is no plan", () => {
    const { html } = buildOverdueReminderEmail({ ...base, language: "EN" });
    expect(html).toContain("invoice INV-0009");
    expect(html).not.toContain("instalment");
  });
});
