import type { DocumentType } from "./document-types.js";
import { getDueDateLabel } from "./document-labels.js";
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
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
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
  if (dueLabel && input.dueDate) lines.push(`${dueLabel}: ${formatDate(input.dueDate)}.`);
  lines.push(`${input.kind === "reminder" ? "View and pay it here" : "View it here"}: ${input.viewUrl}`);
  return lines.join("\n");
}

export function buildWhatsAppLink(phone: string | null | undefined, message: string): string | null {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
