export const PREMIUM_STYLES = `
.status-pill { display: inline-block; padding: 1mm 3mm; border-radius: 999px; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
.amount-words { margin-top: 6mm; border: 1px solid #d1d5db; border-radius: 2mm; padding: 3mm 4mm; }
.amount-words-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.12em; color: #6b7280; font-weight: 700; margin-bottom: 1mm; }
.amount-words-text { font-weight: 600; font-style: italic; }
.footer-bar { margin-top: 10mm; padding: 6mm 8mm; border-radius: 2mm; color: #ffffff; display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm; }
.footer-payment-title { font-weight: 700; margin-bottom: 1mm; }
.footer-payment, .footer-contact { font-size: 9.5px; line-height: 1.6; opacity: 0.9; }
.signatures { display: flex; gap: 10mm; }
.signature { text-align: center; min-width: 32mm; }
.signature-line { border-bottom: 1px solid #ffffff; margin-bottom: 1.5mm; height: 8mm; }
.signature-image { display: block; max-height: 8mm; max-width: 32mm; margin: 0 auto 1.5mm; object-fit: contain; }
.signature-name { font-size: 10px; font-weight: 700; }
.signature-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; }
`;

import type { PdfLabels } from "@billa/shared";

export function renderStatusPill(status: "DRAFT" | "FINALIZED", labels: PdfLabels): string {
  const isFinal = status === "FINALIZED";
  const bg = isFinal ? "#DCFCE7" : "#F3F4F6";
  const fg = isFinal ? "#166534" : "#6B7280";
  const label = isFinal ? labels.finalized : labels.draft;
  return `<span class="status-pill" style="background:${bg}; color:${fg}">${label}</span>`;
}

export function renderTotalsBox(data: {
  subtotalFormatted: string;
  taxTotalFormatted: string;
  totalFormatted: string;
  dark: string;
  labels: PdfLabels;
}): string {
  return `<div class="totals-box">
    <div class="totals-row"><span>${data.labels.subtotal}</span><span>${data.subtotalFormatted}</span></div>
    <div class="totals-row"><span>${data.labels.tax}</span><span>${data.taxTotalFormatted}</span></div>
    <div class="totals-row total" style="background:${data.dark}"><span>${data.labels.total}</span><span>${data.totalFormatted}</span></div>
  </div>`;
}

export function renderAmountInWordsBox(amountInWordsFormatted: string, labels: PdfLabels): string {
  return `<div class="amount-words">
    <div class="amount-words-label">${labels.amountInWords}</div>
    <div class="amount-words-text">${amountInWordsFormatted}</div>
  </div>`;
}

export interface FooterSignature {
  label: string;
  name?: string | null;
  imageDataUri?: string | null;
}

interface FooterBusiness {
  name: string;
  phone: string | null;
  email: string | null;
  tin: string | null;
  rraEbmNumber: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
}

function renderSignature({ label, name, imageDataUri }: FooterSignature): string {
  return `<div class="signature">
    ${imageDataUri ? `<img class="signature-image" src="${imageDataUri}" />` : `<div class="signature-line"></div>`}
    ${name ? `<div class="signature-name">${name}</div>` : ""}
    <div class="signature-label">${label}</div>
  </div>`;
}

export function buildSignatures(
  business: { signatoryName: string | null; signatoryTitle: string | null; signatureDataUri?: string | null },
  showTotals: boolean,
  labels: PdfLabels,
): FooterSignature[] {
  if (!showTotals) {
    return [
      { label: labels.dispatchedBy, name: business.signatoryName, imageDataUri: business.signatureDataUri },
      { label: labels.receivedBy },
    ];
  }
  return [
    {
      label: business.signatoryTitle ?? labels.authorizedSignature,
      name: business.signatoryName,
      imageDataUri: business.signatureDataUri,
    },
  ];
}

export function renderFooterBar(options: {
  business: FooterBusiness;
  dark: string;
  documentNumber: string;
  showPaymentInstructions: boolean;
  signatures: FooterSignature[];
  labels: PdfLabels;
}): string {
  const { business, dark, documentNumber, showPaymentInstructions, signatures, labels } = options;
  const hasBankDetails = Boolean(business.bankName || business.bankAccountNumber);

  const leftHtml =
    showPaymentInstructions && hasBankDetails
      ? `<div class="footer-payment">
          <div class="footer-payment-title">${labels.paymentInstructions}</div>
          ${business.bankName ? `<div>${labels.bank}: ${business.bankName}</div>` : ""}
          <div>${labels.accountName}: ${business.name}</div>
          ${business.bankAccountNumber ? `<div>${labels.accountNo}: ${business.bankAccountNumber}</div>` : ""}
          <div>${labels.reference}: ${documentNumber}</div>
        </div>`
      : `<div class="footer-contact">${[
          business.phone,
          business.email,
          business.tin ? `${labels.tin} ${business.tin}` : null,
          business.rraEbmNumber,
        ]
          .filter((value): value is string => Boolean(value))
          .join("&nbsp;&nbsp;&bull;&nbsp;&nbsp;")}</div>`;

  return `<div class="footer-bar" style="background:${dark}">
    ${leftHtml}
    <div class="signatures">${signatures.map(renderSignature).join("")}</div>
  </div>`;
}
