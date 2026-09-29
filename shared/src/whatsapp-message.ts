import type { DocumentType } from "./document-types.js";
import { getDueDateLabel } from "./document-labels.js";
import { formatShortDate } from "./format-date.js";
import { formatRwf } from "./money.js";
import { getPdfLabels } from "./pdf-labels.js";
import { toWhatsAppNumber } from "./whatsapp-number.js";

export interface WhatsAppMessageInput {
  kind: "share" | "reminder";
  customerName: string;
  businessName: string;
  type: DocumentType;
  number: string | null;
  // The document total when sharing, the amount still owed when reminding.
  amount: number;
  dueDate: string | null;
  viewUrl: string;
  // The public page takes a MoMo payment for this document.
  payable?: boolean;
}

export function buildWhatsAppMessage(input: WhatsAppMessageInput): string {
  const labels = getPdfLabels("EN");
  const typeLabel = labels.typeLabels[input.type].toLowerCase();
  const reference = input.number ? `${typeLabel} ${input.number}` : typeLabel;
  const dueLabel = getDueDateLabel(input.type, labels);

  const opening =
    input.kind === "reminder"
      ? `Hello ${input.customerName}, a reminder from ${input.businessName} that ${reference} has ${formatRwf(input.amount)} outstanding.`
      : `Hello ${input.customerName}, ${input.businessName} sent you ${reference} for ${formatRwf(input.amount)}.`;
  const lines = [opening];
  if (dueLabel && input.dueDate) lines.push(`${dueLabel}: ${formatShortDate(input.dueDate)}.`);
  const canPay = input.payable === true && input.type === "INVOICE";
  lines.push(`${canPay ? "View and pay it here" : "View it here"}: ${input.viewUrl}`);
  return lines.join("\n");
}

export function buildWhatsAppLink(phone: string | null | undefined, message: string): string | null {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export interface StatementWhatsAppInput {
  customerName: string;
  businessName: string;
  totalOwed: number;
  portalUrl: string;
  payable?: boolean;
}

export function buildStatementWhatsAppMessage(input: StatementWhatsAppInput): string {
  return [
    `Hello ${input.customerName}, this is your statement from ${input.businessName}. You currently owe ${formatRwf(input.totalOwed)}.`,
    `${input.payable ? "See and pay your invoices here" : "See your invoices here"}: ${input.portalUrl}`,
  ].join("\n");
}
