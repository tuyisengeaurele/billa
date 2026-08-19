import type { Business, Customer, Document, DocumentLine, DocumentType } from "@prisma/client";
import { formatRwf, getDueDateLabel, getPartyLabel } from "@billa/shared";
import { escapeHtml } from "./escape-html.js";
import { readLogoDataUri } from "./logo.js";

const DEFAULT_ACCENT = "#27272a";

const TYPE_LABELS: Record<DocumentType, string> = {
  INVOICE: "Invoice",
  PROFORMA: "Proforma Invoice",
  DELIVERY_NOTE: "Delivery Note",
  QUOTE: "Quote",
  RECEIPT: "Receipt",
};

export interface PdfRenderLine {
  description: string;
  quantity: string;
  unitPriceFormatted: string;
  taxRateFormatted: string;
  lineTotalFormatted: string;
}

export interface PdfRenderData {
  business: {
    name: string;
    tin: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    rraEbmNumber: string | null;
    accentColor: string;
    logoDataUri: string | null;
  };
  customer: {
    name: string;
    tin: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  typeLabel: string;
  partyLabel: string;
  dueDateLabel: string | null;
  number: string | null;
  status: "DRAFT" | "FINALIZED";
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  lines: PdfRenderLine[];
  subtotalFormatted: string;
  taxTotalFormatted: string;
  totalFormatted: string;
}

type DocumentWithRelations = Document & { lines: DocumentLine[]; customer: Customer };

function escapeNullable(value: string | null): string | null {
  return value === null ? null : escapeHtml(value);
}

export async function buildPdfRenderData(
  document: DocumentWithRelations,
  business: Business,
): Promise<PdfRenderData> {
  const logoDataUri = await readLogoDataUri(business.logoUrl, business.id);

  return {
    business: {
      name: escapeHtml(business.name),
      tin: escapeNullable(business.tin),
      address: escapeNullable(business.address),
      phone: escapeNullable(business.phone),
      email: escapeNullable(business.email),
      rraEbmNumber: escapeNullable(business.rraEbmNumber),
      accentColor: business.primaryColor ?? DEFAULT_ACCENT,
      logoDataUri,
    },
    customer: {
      name: escapeHtml(document.customer.name),
      tin: escapeNullable(document.customer.tin),
      address: escapeNullable(document.customer.address),
      phone: escapeNullable(document.customer.phone),
      email: escapeNullable(document.customer.email),
    },
    typeLabel: TYPE_LABELS[document.type],
    partyLabel: getPartyLabel(document.type),
    dueDateLabel: getDueDateLabel(document.type),
    number: document.number,
    status: document.status,
    issueDate: document.issueDate.toISOString().slice(0, 10),
    dueDate: document.dueDate ? document.dueDate.toISOString().slice(0, 10) : null,
    notes: escapeNullable(document.notes),
    lines: [...document.lines]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((line) => ({
        description: escapeHtml(line.description),
        quantity: line.quantity.toString(),
        unitPriceFormatted: formatRwf(line.unitPrice),
        taxRateFormatted: `${line.taxRate.toString()}%`,
        lineTotalFormatted: formatRwf(line.lineTotal),
      })),
    subtotalFormatted: formatRwf(document.subtotal),
    taxTotalFormatted: formatRwf(document.taxTotal),
    totalFormatted: formatRwf(document.total),
  };
}
