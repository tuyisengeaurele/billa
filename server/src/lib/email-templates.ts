import type { DocumentLanguage } from "@billa/shared";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphs(lines: string[]): string {
  return lines.map((line) => `<p style="margin:0 0 16px;">${line}</p>`).join("");
}

function renderEmailShell(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#18181b;padding:22px 32px;">
                <span style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.01em;">Billa</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-size:15px;line-height:1.6;color:#3f3f46;">${bodyHtml}</td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:#fafafa;border-top:1px solid #e4e4e7;">
                <p style="margin:0;font-size:12px;color:#a1a1aa;">Billa, invoicing for Rwandan businesses.</p>
              </td>
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
}

export function buildDocumentSendEmail(input: DocumentSendEmailInput): { subject: string; html: string } {
  const { language, customerName, typeLabel, number, businessName } = input;
  const customer = escapeHtml(customerName);
  const business = escapeHtml(businessName);
  const type = escapeHtml(typeLabel);
  const docNumber = number ? escapeHtml(number) : "";
  const typeLower = type.toLowerCase();

  if (language === "FR") {
    return {
      subject: `${typeLabel} ${number ?? ""} de ${businessName}`.trim(),
      html: renderEmailShell(
        paragraphs([
          `Bonjour ${customer},`,
          `Merci de faire confiance à ${business}. Vous trouverez ci-joint votre ${typeLower} ${docNumber} au format PDF.`,
          `Pour toute question à ce sujet, il vous suffit de répondre à cet e-mail.`,
          `Cordialement,<br>L'équipe ${business}`,
        ]),
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
      ]),
    ),
  };
}

export interface OverdueReminderEmailInput {
  language: DocumentLanguage;
  customerName: string;
  number: string | null;
  businessName: string;
  dueDate: string;
}

export function buildOverdueReminderEmail(input: OverdueReminderEmailInput): { subject: string; html: string } {
  const { language, customerName, number, businessName, dueDate } = input;
  const customer = escapeHtml(customerName);
  const business = escapeHtml(businessName);
  const docNumber = number ? escapeHtml(number) : "";

  if (language === "FR") {
    return {
      subject: `Rappel : ${number ?? "votre facture"} reste impayée`,
      html: renderEmailShell(
        paragraphs([
          `Bonjour ${customer},`,
          `Ceci est un rappel amical : la facture ${docNumber} de ${business}, échue le ${dueDate}, n'a pas encore été réglée. Vous la trouverez de nouveau en pièce jointe.`,
          `Si le paiement a déjà été envoyé, merci et veuillez ignorer ce message. Sinon, répondez à cet e-mail à tout moment.`,
          `Cordialement,<br>L'équipe ${business}`,
        ]),
      ),
    };
  }

  return {
    subject: `Reminder: ${number ?? "your invoice"} is still outstanding`,
    html: renderEmailShell(
      paragraphs([
        `Hi ${customer},`,
        `This is a friendly reminder that invoice ${docNumber} from ${business}, due on ${dueDate}, has not been paid yet. A copy is attached again for convenience.`,
        `If you have already sent payment, thank you, and please disregard this note. Otherwise, reply here anytime.`,
        `Best,<br>The ${business} team`,
      ]),
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
        `<a href="${input.link}" style="color:#2563eb;">Accept the invite</a>`,
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
