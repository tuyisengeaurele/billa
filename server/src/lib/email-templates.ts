import {
  formatMoney,
  formatMoneyTotals,
  formatShortDate,
  isCurrency,
  type Currency,
  type DocumentLanguage,
} from "@billa/shared";
import { publicBaseUrl } from "./asset-url.js";

const BRAND_PINK = "#c2185b";

// Billa's own logo, not a business's uploaded one - it's a static asset this
// same service serves (client/public/logo.png), so it's reachable at its own
// public URL the same way a business's R2-hosted logo is (see asset-url.ts).
function billaLogoUrl(): string {
  return `${publicBaseUrl()}/logo.png`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatEmailDate(iso: string): string {
  return formatShortDate(iso);
}

function paragraphs(lines: string[]): string {
  return lines.map((line) => `<p style="margin:0 0 16px;">${line}</p>`).join("");
}

const VIEW_BUTTON_LABELS: Record<DocumentLanguage, { view: string; viewAndPay: string }> = {
  EN: { view: "View online", viewAndPay: "View and pay online" },
  FR: { view: "Voir en ligne", viewAndPay: "Voir et payer en ligne" },
};

function viewOnlineButton(viewUrl: string | null, language: DocumentLanguage, payable = false): string {
  if (!viewUrl) return "";
  const labels = VIEW_BUTTON_LABELS[language];
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
      <tr>
        <td style="border-radius:8px;background:${BRAND_PINK};">
          <a href="${viewUrl}" style="display:inline-block;padding:10px 20px;font-size:13px;font-weight:600;color:#ffffff;text-decoration:none;">${payable ? labels.viewAndPay : labels.view}</a>
        </td>
      </tr>
    </table>`;
}

const STOP_REMINDERS_LABELS: Record<DocumentLanguage, { lead: string; link: string }> = {
  EN: { lead: "Don't want these reminders?", link: "Stop reminders for this document" },
  FR: { lead: "Vous ne souhaitez plus ces rappels ?", link: "Arrêter les rappels pour ce document" },
};

/**
 * A line under the button that lets the customer who got a reminder switch further reminders off for that one
 * document. The link opens the document page asking to confirm, so a mail scanner that opens links cannot
 * switch anything off by itself.
 */
function stopRemindersNote(viewUrl: string | null, language: DocumentLanguage): string {
  if (!viewUrl) return "";
  const labels = STOP_REMINDERS_LABELS[language];
  return `<p style="margin:0 0 16px;font-size:12px;color:#71717a;">${labels.lead} <a href="${viewUrl}?stop=1" style="color:#71717a;">${labels.link}</a>.</p>`;
}

export interface BusinessFooterInput {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
}

export interface SenderInput {
  name: string | null;
  phone: string | null;
  email: string;
}

function renderFooter(business?: BusinessFooterInput, sender?: SenderInput | null): string {
  if (!business) {
    return `
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:middle;padding-right:8px;">
          <img src="${billaLogoUrl()}" width="16" height="16" alt="" style="display:block;">
        </td>
        <td style="vertical-align:middle;font-size:12px;color:#a1a1aa;">Billa, invoicing for Rwandan businesses.</td>
      </tr>
    </table>`;
  }

  const name = escapeHtml(business.name);
  const contactLine = [business.address, business.phone, business.email]
    .filter((part): part is string => Boolean(part))
    .map(escapeHtml)
    .join(" &middot; ");
  const logo = business.logoUrl
    ? `<img src="${business.logoUrl}" alt="${name}" width="120" style="max-height:32px;width:auto;display:block;margin-bottom:10px;">`
    : "";

  const businessBlock = `
    ${logo}
    <p style="margin:0;font-size:13px;font-weight:600;color:#27272a;">${name}</p>
    ${contactLine ? `<p style="margin:3px 0 0;font-size:12px;color:#71717a;">${contactLine}</p>` : ""}
  `;

  const senderLine = [sender?.phone, sender?.email].filter((part): part is string => Boolean(part)).map(escapeHtml).join(" &middot; ");
  const senderBlock =
    sender && sender.name
      ? `
    <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;color:#a1a1aa;">Sent by</p>
    <p style="margin:3px 0 0;font-size:13px;font-weight:600;color:#27272a;">${escapeHtml(sender.name)}</p>
    ${senderLine ? `<p style="margin:2px 0 0;font-size:12px;color:#71717a;">${senderLine}</p>` : ""}
  `
      : "";

  if (!senderBlock) {
    return `${businessBlock}<p style="margin:12px 0 0;font-size:11px;color:#a1a1aa;">Sent with Billa.</p>`;
  }

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:top;width:60%;">${businessBlock}</td>
        <td style="vertical-align:top;width:40%;text-align:right;">${senderBlock}</td>
      </tr>
    </table>
    <p style="margin:12px 0 0;font-size:11px;color:#a1a1aa;">Sent with Billa.</p>
  `;
}

function renderEmailShell(bodyHtml: string, business?: BusinessFooterInput, sender?: SenderInput | null): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
            <tr>
              <td style="background:${BRAND_PINK};height:4px;line-height:4px;font-size:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle;padding-right:9px;">
                      <img src="${billaLogoUrl()}" width="26" height="26" alt="" style="display:block;">
                    </td>
                    <td style="vertical-align:middle;">
                      <span style="font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:700;color:#18181b;letter-spacing:-0.01em;">Billa</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 8px;font-size:15px;line-height:1.6;color:#3f3f46;">${bodyHtml}</td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;">${renderFooter(business, sender)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export interface DocumentSendEmailInput {
  language: DocumentLanguage;
  customerName: string;
  typeLabel: string;
  number: string | null;
  businessName: string;
  businessAddress: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  businessLogoUrl: string | null;
  sender: SenderInput | null;
  viewUrl: string | null;
  // The linked page takes a MoMo payment, so the button should say so.
  payable?: boolean;
}

export function buildDocumentSendEmail(input: DocumentSendEmailInput): { subject: string; html: string } {
  const { language, customerName, typeLabel, number, businessName, viewUrl, payable } = input;
  const customer = escapeHtml(customerName);
  const business = escapeHtml(businessName);
  const type = escapeHtml(typeLabel);
  const docNumber = number ? escapeHtml(number) : "";
  const typeLower = type.toLowerCase();
  const footer: BusinessFooterInput = {
    name: businessName,
    address: input.businessAddress,
    phone: input.businessPhone,
    email: input.businessEmail,
    logoUrl: input.businessLogoUrl,
  };

  if (language === "FR") {
    return {
      subject: `${typeLabel} ${number ?? ""} de ${businessName}`.trim(),
      html: renderEmailShell(
        paragraphs([
          `Bonjour ${customer},`,
          `Merci de faire confiance à ${business}. Vous trouverez ci-joint votre ${typeLower} ${docNumber} au format PDF.`,
          `Pour toute question à ce sujet, il vous suffit de répondre à cet e-mail.`,
          `Cordialement,<br>L'équipe ${business}`,
        ]) + viewOnlineButton(viewUrl, language, payable),
        footer,
        input.sender,
      ),
    };
  }

  return {
    subject: `${typeLabel} ${number ?? ""} from ${businessName}`.trim(),
    html: renderEmailShell(
      paragraphs([
        `Hi ${customer},`,
        `Thank you for choosing ${business}. Your ${typeLower} ${docNumber} is attached to this email as a PDF.`,
        `If you have any questions, just reply to this email and we will get back to you.`,
        `Warm regards,<br>The ${business} team`,
      ]) + viewOnlineButton(viewUrl, language, payable),
      footer,
      input.sender,
    ),
  };
}

export interface OverdueReminderEmailInput {
  language: DocumentLanguage;
  customerName: string;
  number: string | null;
  businessName: string;
  dueDate: string;
  businessAddress: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  businessLogoUrl: string | null;
  viewUrl: string | null;
  payable?: boolean;
  // Set when the invoice is paid in instalments and it is one of them that is late.
  installment?: { label: string | null; amount: number };
  // The invoice's currency; RWF when left out.
  currency?: string;
}

export function buildOverdueReminderEmail(input: OverdueReminderEmailInput): { subject: string; html: string } {
  const { language, customerName, number, businessName, dueDate, viewUrl, payable, installment } = input;
  const customer = escapeHtml(customerName);
  const business = escapeHtml(businessName);
  const docNumber = number ? escapeHtml(number) : "";
  const stepLabel = installment?.label ? escapeHtml(installment.label) : null;
  const currency: Currency = input.currency && isCurrency(input.currency) ? input.currency : "RWF";
  const stepAmount = installment ? formatMoney(installment.amount, currency) : "";
  const footer: BusinessFooterInput = {
    name: businessName,
    address: input.businessAddress,
    phone: input.businessPhone,
    email: input.businessEmail,
    logoUrl: input.businessLogoUrl,
  };

  if (language === "FR") {
    return {
      subject: `Rappel : ${number ?? "votre facture"} reste impayée`,
      html: renderEmailShell(
        paragraphs([
          `Bonjour ${customer},`,
          installment
            ? `Ceci est un rappel amical : ${stepLabel ? `l'échéance ${stepLabel}` : "une échéance"} de ${stepAmount} de la facture ${docNumber} de ${business}, échue le ${dueDate}, n'a pas encore été réglée. Vous retrouverez la facture en pièce jointe.`
            : `Ceci est un rappel amical : la facture ${docNumber} de ${business}, échue le ${dueDate}, n'a pas encore été réglée. Vous la trouverez de nouveau en pièce jointe.`,
          `Si le paiement a déjà été envoyé, merci et veuillez ignorer ce message. Sinon, répondez à cet e-mail à tout moment.`,
          `Cordialement,<br>L'équipe ${business}`,
        ]) + viewOnlineButton(viewUrl, language, payable) + stopRemindersNote(viewUrl, language),
        footer,
      ),
    };
  }

  return {
    subject: `Reminder: ${number ?? "your invoice"} is still outstanding`,
    html: renderEmailShell(
      paragraphs([
        `Hi ${customer},`,
        installment
          ? `This is a friendly reminder that ${stepLabel ? `the ${stepLabel} instalment` : "an instalment"} of ${stepAmount} for invoice ${docNumber} from ${business}, due on ${dueDate}, has not been paid yet. A copy of the invoice is attached for convenience.`
          : `This is a friendly reminder that invoice ${docNumber} from ${business}, due on ${dueDate}, has not been paid yet. A copy is attached again for convenience.`,
        `If you have already sent payment, thank you, and please disregard this note. Otherwise, reply here anytime.`,
        `Best,<br>The ${business} team`,
      ]) + viewOnlineButton(viewUrl, language, payable) + stopRemindersNote(viewUrl, language),
      footer,
    ),
  };
}

export interface DueSoonReminderEmailInput {
  language: DocumentLanguage;
  customerName: string;
  number: string | null;
  businessName: string;
  dueDate: string;
  // What falls due on that date, in the invoice's currency.
  amount: number;
  currency?: string;
  // Set when the invoice is paid in instalments and it is one of them that is coming up.
  isInstallment?: boolean;
  installmentLabel?: string | null;
  businessAddress: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  businessLogoUrl: string | null;
  viewUrl: string | null;
  payable?: boolean;
}

/** A friendly note a few days before a payment is due, so it does not become a chase later. */
export function buildDueSoonReminderEmail(input: DueSoonReminderEmailInput): { subject: string; html: string } {
  const { language, customerName, number, businessName, dueDate, viewUrl, payable } = input;
  const customer = escapeHtml(customerName);
  const business = escapeHtml(businessName);
  const docNumber = number ? escapeHtml(number) : "";
  const currency: Currency = input.currency && isCurrency(input.currency) ? input.currency : "RWF";
  const amount = formatMoney(input.amount, currency);
  const stepLabel = input.installmentLabel ? escapeHtml(input.installmentLabel) : null;
  const footer: BusinessFooterInput = {
    name: businessName,
    address: input.businessAddress,
    phone: input.businessPhone,
    email: input.businessEmail,
    logoUrl: input.businessLogoUrl,
  };

  if (language === "FR") {
    return {
      subject: `${number ?? "Votre facture"} arrive à échéance le ${dueDate}`,
      html: renderEmailShell(
        paragraphs([
          `Bonjour ${customer},`,
          input.isInstallment
            ? `Un petit rappel : ${stepLabel ? `l'échéance ${stepLabel}` : "une échéance"} de ${amount} de la facture ${docNumber} de ${business} est due le ${dueDate}.`
            : `Un petit rappel : la facture ${docNumber} de ${business}, d'un montant de ${amount}, est due le ${dueDate}.`,
          `Si le paiement est déjà en route, merci et veuillez ignorer ce message. Pour toute question, répondez simplement à cet e-mail.`,
          `Cordialement,<br>L'équipe ${business}`,
        ]) + viewOnlineButton(viewUrl, language, payable) + stopRemindersNote(viewUrl, language),
        footer,
      ),
    };
  }

  return {
    subject: `${number ?? "Your invoice"} is due on ${dueDate}`,
    html: renderEmailShell(
      paragraphs([
        `Hi ${customer},`,
        input.isInstallment
          ? `A quick heads-up that ${stepLabel ? `the ${stepLabel} instalment` : "an instalment"} of ${amount} for invoice ${docNumber} from ${business} is due on ${dueDate}.`
          : `A quick heads-up that invoice ${docNumber} from ${business}, for ${amount}, is due on ${dueDate}.`,
        `If payment is already on its way, thank you, and please disregard this note. Otherwise, reply here anytime.`,
        `Best,<br>The ${business} team`,
      ]) + viewOnlineButton(viewUrl, language, payable) + stopRemindersNote(viewUrl, language),
      footer,
    ),
  };
}

export interface QuoteExpiryReminderEmailInput {
  language: DocumentLanguage;
  customerName: string;
  typeLabel: string;
  number: string | null;
  businessName: string;
  expiryDate: string;
  businessAddress: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  businessLogoUrl: string | null;
  viewUrl: string | null;
}

export function buildQuoteExpiryReminderEmail(input: QuoteExpiryReminderEmailInput): { subject: string; html: string } {
  const { language, customerName, typeLabel, number, businessName, expiryDate, viewUrl } = input;
  const customer = escapeHtml(customerName);
  const business = escapeHtml(businessName);
  const type = escapeHtml(typeLabel);
  const docNumber = number ? escapeHtml(number) : "";
  const typeLower = type.toLowerCase();
  const footer: BusinessFooterInput = {
    name: businessName,
    address: input.businessAddress,
    phone: input.businessPhone,
    email: input.businessEmail,
    logoUrl: input.businessLogoUrl,
  };

  if (language === "FR") {
    return {
      subject: `${typeLabel} ${number ?? ""} expire bientôt`.trim(),
      html: renderEmailShell(
        paragraphs([
          `Bonjour ${customer},`,
          `Ceci est un rappel amical : votre ${typeLower} ${docNumber} de ${business} expire le ${expiryDate}. Si vous souhaitez l'accepter, faites-le avant cette date.`,
          `Pour toute question, il vous suffit de répondre à cet e-mail.`,
          `Cordialement,<br>L'équipe ${business}`,
        ]) + viewOnlineButton(viewUrl, language) + stopRemindersNote(viewUrl, language),
        footer,
      ),
    };
  }

  return {
    subject: `${typeLabel} ${number ?? ""} expires soon`.trim(),
    html: renderEmailShell(
      paragraphs([
        `Hi ${customer},`,
        `This is a friendly reminder that your ${typeLower} ${docNumber} from ${business} expires on ${expiryDate}. If you would like to accept it, please do so before then.`,
        `If you have any questions, just reply to this email.`,
        `Best,<br>The ${business} team`,
      ]) + viewOnlineButton(viewUrl, language) + stopRemindersNote(viewUrl, language),
      footer,
    ),
  };
}

export interface ContactReplyEmailInput {
  recipientName: string;
  originalMessage: string;
  replyMessage: string;
}

export function buildContactReplyEmail(input: ContactReplyEmailInput): { subject: string; html: string } {
  const { recipientName, originalMessage, replyMessage } = input;
  const name = escapeHtml(recipientName);
  const original = escapeHtml(originalMessage).replace(/\n/g, "<br>");
  const reply = escapeHtml(replyMessage).replace(/\n/g, "<br>");

  return {
    subject: "Re: your message to Billa",
    html: renderEmailShell(
      `<p style="margin:0 0 16px;">Hi ${name},</p>` +
        `<p style="margin:0 0 8px;">Thanks for reaching out. Here is what you sent us:</p>` +
        `<blockquote style="margin:0 0 16px;padding:12px 16px;background:#fafafa;border-left:3px solid #e4e4e7;color:#71717a;">${original}</blockquote>` +
        `<p style="margin:0 0 16px;">${reply}</p>` +
        `<p style="margin:0;">If you need anything else, just reply to this email.<br>Best,<br>The Billa team</p>`,
    ),
  };
}

export interface InviteEmailInput {
  businessName: string;
  link: string;
}

export function buildInviteEmail(input: InviteEmailInput): { subject: string; html: string } {
  const business = escapeHtml(input.businessName);
  return {
    subject: `You have been invited to join ${input.businessName} on Billa`,
    html: renderEmailShell(
      paragraphs([
        `Hi there,`,
        `You have been invited to join <strong>${business}</strong> on Billa. Once you accept, you will be able to help manage its documents and customers.`,
        `<a href="${input.link}" style="color:${BRAND_PINK};font-weight:600;">Accept the invite</a>`,
        `If you were not expecting this, feel free to ignore this email.`,
      ]),
    ),
  };
}

export interface OwnerDigestEmailInput {
  businessName: string;
  totalCollectedFormatted: string;
  newlyOverdueCount: number;
}

export function buildOwnerDigestEmail(input: OwnerDigestEmailInput): { subject: string; html: string } {
  const { businessName, totalCollectedFormatted, newlyOverdueCount } = input;
  const business = escapeHtml(businessName);
  return {
    subject: `Your weekly summary for ${businessName}`,
    html: renderEmailShell(
      paragraphs([
        `Hi,`,
        `Here is how ${business} did this past week: ${totalCollectedFormatted} collected, and ${newlyOverdueCount} invoice${newlyOverdueCount === 1 ? "" : "s"} newly overdue.`,
        `Log in to Billa any time for the full picture.`,
      ]),
    ),
  };
}

export interface ContactNotificationEmailInput {
  name: string;
  email: string;
  message: string;
}

export function buildContactNotificationEmail(input: ContactNotificationEmailInput): { subject: string; html: string } {
  const name = escapeHtml(input.name);
  const email = escapeHtml(input.email);
  const message = escapeHtml(input.message).replace(/\n/g, "<br>");
  return {
    subject: `New contact message from ${input.name}`,
    html: renderEmailShell(
      `<p style="margin:0 0 16px;">${name} (${email}) just sent this through the contact form:</p>` +
        `<blockquote style="margin:0;padding:12px 16px;background:#fafafa;border-left:3px solid #e4e4e7;color:#3f3f46;">${message}</blockquote>`,
    ),
  };
}

export interface StatementEmailInput {
  customerName: string;
  businessName: string;
  businessAddress: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  businessLogoUrl: string | null;
  sender: SenderInput | null;
  portalUrl: string;
  payable?: boolean;
  invoices: { number: string | null; dueDate: string | null; amountOwed: number; currency?: Currency }[];
}

/** A plain list of what a customer still owes, with a link to see and pay it. English only for now. */
export function buildStatementEmail(input: StatementEmailInput): { subject: string; html: string } {
  const customer = escapeHtml(input.customerName);
  const business = escapeHtml(input.businessName);
  const total = formatMoneyTotals(
    input.invoices.map((invoice) => ({ currency: invoice.currency ?? "RWF", amount: invoice.amountOwed })),
  );
  const footer: BusinessFooterInput = {
    name: input.businessName,
    address: input.businessAddress,
    phone: input.businessPhone,
    email: input.businessEmail,
    logoUrl: input.businessLogoUrl,
  };

  const rows = input.invoices
    .map(
      (invoice) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f4f4f5;">${escapeHtml(invoice.number ?? "Invoice")}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f4f4f5;color:#71717a;">${invoice.dueDate ? `Due ${formatEmailDate(invoice.dueDate)}` : ""}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f4f4f5;text-align:right;">${formatMoney(invoice.amountOwed, invoice.currency ?? "RWF")}</td>
      </tr>`,
    )
    .join("");

  const table = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px;">
      ${rows}
      <tr>
        <td colspan="2" style="padding:10px 0;font-weight:600;">Total owed</td>
        <td style="padding:10px 0;text-align:right;font-weight:600;">${total}</td>
      </tr>
    </table>`;

  return {
    subject: `Your statement from ${input.businessName}`,
    html: renderEmailShell(
      paragraphs([
        `Hi ${customer},`,
        `Here is what is still open with ${business}.`,
      ]) +
        table +
        paragraphs([`If you have already paid any of these, thank you, and please ignore that line. Reply here if something looks wrong.`]) +
        viewOnlineButton(input.portalUrl, "EN", input.payable),
      footer,
      input.sender,
    ),
  };
}
