import type { DocumentType } from "./document-types.js";
import { getDueDateLabel } from "./document-labels.js";
import { formatShortDate } from "./format-date.js";
import { formatMoney, formatMoneyTotals, type Currency, type MoneyAmount } from "./currency.js";
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
  // The currency of the amounts. RWF when left out.
  currency?: Currency;
  dueDate: string | null;
  viewUrl: string;
  // The public page takes a MoMo payment for this document.
  payable?: boolean;
  // A reminder for an invoice on a payment plan says which instalment is due now.
  instalment?: { label: string | null; amount: number };
}

export function buildWhatsAppMessage(input: WhatsAppMessageInput): string {
  const labels = getPdfLabels("EN");
  const typeLabel = labels.typeLabels[input.type].toLowerCase();
  const reference = input.number ? `${typeLabel} ${input.number}` : typeLabel;
  const dueLabel = getDueDateLabel(input.type, labels);
  const money = (amount: number) => formatMoney(amount, input.currency ?? "RWF");

  const opening =
    input.kind === "reminder"
      ? `Hello ${input.customerName}, a reminder from ${input.businessName} that ${reference} has ${money(input.amount)} outstanding${
          input.instalment
            ? `, of which ${money(input.instalment.amount)} (${input.instalment.label?.trim() || "the next instalment"}) is due now`
            : ""
        }.`
      : `Hello ${input.customerName}, ${input.businessName} sent you ${reference} for ${money(input.amount)}.`;
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
  // What is owed in each currency. When given, it is used instead of totalOwed, which is RWF only.
  totals?: MoneyAmount[];
  portalUrl: string;
  payable?: boolean;
}

export function buildStatementWhatsAppMessage(input: StatementWhatsAppInput): string {
  return [
    `Hello ${input.customerName}, this is your statement from ${input.businessName}. You currently owe ${input.totals ? formatMoneyTotals(input.totals) : formatRwf(input.totalOwed)}.`,
    `${input.payable ? "See and pay your invoices here" : "See your invoices here"}: ${input.portalUrl}`,
  ].join("\n");
}
