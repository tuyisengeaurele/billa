import type { Business, Customer, Document, DocumentInstalment, DocumentLine } from "@prisma/client";
import {
  amountInWordsEn,
  amountInWordsFr,
  amountInWordsFrCurrency,
  amountInWordsRwf,
  currencyName,
  formatMoney,
  getDueDateLabel,
  getPartyLabel,
  getPdfLabels,
  isCurrency,
  type Currency,
  type PdfLabels,
} from "@billa/shared";
import QRCode from "qrcode";
import { pickStructuralDark } from "../color.js";
import { escapeHtml } from "./escape-html.js";
import { prisma } from "../prisma.js";
import { readLogoDataUri } from "./logo.js";

const DEFAULT_ACCENT = "#27272a";

export interface PdfRenderLine {
  description: string;
  quantity: string;
  unitPriceFormatted: string;
  taxRateFormatted: string;
  lineTotalFormatted: string;
  discountFormatted: string | null;
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
    darkColor: string;
    bankName: string | null;
    bankAccountNumber: string | null;
    signatoryName: string | null;
    signatoryTitle: string | null;
    logoDataUri: string | null;
    signatureDataUri: string | null;
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
  labels: PdfLabels;
  number: string | null;
  status: "DRAFT" | "FINALIZED";
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  customerReference: string | null;
  lines: PdfRenderLine[];
  subtotalFormatted: string;
  taxTotalFormatted: string;
  totalFormatted: string;
  // "RWF (Rwandan Franc)" or "USD (US dollar)": what the premium template prints under Currency.
  currencyLabel: string;
  // The footer note about the currency; falls back to the RWF wording when left out.
  allAmountsInFormatted?: string;
  showTotals: boolean;
  amountInWordsFormatted: string | null;
  viewUrl: string | null;
  qrDataUri: string | null;
  // A payment plan, one entry per instalment in date order. Empty when the invoice is paid in full.
  schedule: { label: string; dueDate: string; amountFormatted: string }[];
}

// Callers that already loaded the plan can pass it; otherwise it is read here, so no PDF can leave it out.
type DocumentWithRelations = Document & { lines: DocumentLine[]; customer: Customer; installments?: DocumentInstalment[] };

function escapeNullable(value: string | null): string | null {
  return value === null ? null : escapeHtml(value);
}

function formatDiscount(line: DocumentLine, currency: Currency): string | null {
  if (!line.discountType || !line.discountValue) return null;
  return line.discountType === "PERCENT"
    ? `${line.discountValue.toString()}% off`
    : `${formatMoney(Number(line.discountValue), currency)} off`;
}

export async function buildPdfRenderData(
  document: DocumentWithRelations,
  business: Business,
): Promise<PdfRenderData> {
  const logoDataUri = await readLogoDataUri(business.logoUrl, business.id);
  const signatureDataUri = await readLogoDataUri(business.signatureUrl, business.id);
  const labels = getPdfLabels(document.language);
  const installments =
    document.installments ??
    (await prisma.documentInstalment.findMany({ where: { documentId: document.id }, orderBy: { sortOrder: "asc" } }));
  const currency: Currency = isCurrency(document.currency) ? document.currency : "RWF";
  const money = (amount: number) => formatMoney(amount, currency);
  const amountInWords = (amount: number) => {
    if (currency === "RWF") return document.language === "FR" ? amountInWordsFr(amount) : amountInWordsRwf(amount);
    return document.language === "FR" ? amountInWordsFrCurrency(amount, currency) : amountInWordsEn(amount, currency);
  };
  const showTotals = document.type !== "DELIVERY_NOTE";
  // Only a finalized document has a public page, so a draft's PDF carries no QR code.
  const viewUrl =
    document.status === "FINALIZED"
      ? `${process.env.CLIENT_ORIGIN ?? "http://localhost:5173"}/view/${document.publicToken}`
      : null;
  const qrDataUri = viewUrl ? await QRCode.toDataURL(viewUrl, { margin: 1, width: 240 }) : null;
  const accentColor = business.primaryColor ?? DEFAULT_ACCENT;
  const accentColors = Array.isArray(business.accentColors)
    ? business.accentColors.filter((c): c is string => typeof c === "string")
    : [];

  return {
    business: {
      name: escapeHtml(business.name),
      tin: escapeNullable(business.tin),
      address: escapeNullable(business.address),
      phone: escapeNullable(business.phone),
      email: escapeNullable(business.email),
      rraEbmNumber: escapeNullable(business.rraEbmNumber),
      accentColor,
      darkColor: pickStructuralDark(accentColor, accentColors),
      bankName: escapeNullable(business.bankName),
      bankAccountNumber: escapeNullable(business.bankAccountNumber),
      signatoryName: escapeNullable(business.signatoryName),
      signatoryTitle: escapeNullable(business.signatoryTitle),
      logoDataUri,
      signatureDataUri,
    },
    customer: {
      name: escapeHtml(document.customer.name),
      tin: escapeNullable(document.customer.tin),
      address: escapeNullable(document.customer.address),
      phone: escapeNullable(document.customer.phone),
      email: escapeNullable(document.customer.email),
    },
    typeLabel: labels.typeLabels[document.type],
    partyLabel: getPartyLabel(document.type, labels),
    dueDateLabel: getDueDateLabel(document.type, labels),
    labels,
    number: document.number,
    status: document.status,
    issueDate: document.issueDate.toISOString().slice(0, 10),
    dueDate: document.dueDate ? document.dueDate.toISOString().slice(0, 10) : null,
    notes: escapeNullable(document.notes),
    customerReference: escapeNullable(document.customerReference),
    lines: [...document.lines]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((line) => ({
        description: escapeHtml(line.description),
        quantity: line.quantity.toString(),
        unitPriceFormatted: money(line.unitPrice),
        taxRateFormatted: `${line.taxRate.toString()}%`,
        lineTotalFormatted: money(line.lineTotal),
        discountFormatted: formatDiscount(line, currency),
      })),
    subtotalFormatted: money(document.subtotal),
    taxTotalFormatted: money(document.taxTotal),
    totalFormatted: money(document.total),
    currencyLabel: currency === "RWF" ? labels.currencyValue : `${currency} (${currencyName(currency)})`,
    allAmountsInFormatted:
      currency === "RWF"
        ? labels.allAmountsIn
        : document.language === "FR"
          ? `Tous les montants sont en ${currencyName(currency)} (${currency})`
          : `All amounts in ${currencyName(currency)} (${currency})`,
    showTotals,
    amountInWordsFormatted: showTotals ? amountInWords(Number(document.total)) : null,
    viewUrl,
    qrDataUri,
    schedule: installments.map((step, index) => ({
      label: step.label ? escapeHtml(step.label) : `${labels.instalment} ${index + 1}`,
      dueDate: step.dueDate.toISOString().slice(0, 10),
      amountFormatted: money(step.amount),
    })),
  };
}
