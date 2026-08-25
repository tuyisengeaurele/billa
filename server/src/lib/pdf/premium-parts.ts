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
.signature-name { font-size: 10px; font-weight: 700; }
.signature-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; }
`;

export function renderStatusPill(status: "DRAFT" | "FINALIZED"): string {
  const isFinal = status === "FINALIZED";
  const bg = isFinal ? "#DCFCE7" : "#F3F4F6";
  const fg = isFinal ? "#166534" : "#6B7280";
  const label = isFinal ? "Finalized" : "Draft";
  return `<span class="status-pill" style="background:${bg}; color:${fg}">${label}</span>`;
}

export function renderTotalsBox(data: {
  subtotalFormatted: string;
  taxTotalFormatted: string;
  totalFormatted: string;
  dark: string;
}): string {
  return `<div class="totals-box">
    <div class="totals-row"><span>Subtotal</span><span>${data.subtotalFormatted}</span></div>
    <div class="totals-row"><span>Tax</span><span>${data.taxTotalFormatted}</span></div>
    <div class="totals-row total" style="background:${data.dark}"><span>Total</span><span>${data.totalFormatted}</span></div>
  </div>`;
}

export function renderAmountInWordsBox(amountInWordsFormatted: string): string {
  return `<div class="amount-words">
    <div class="amount-words-label">Amount in words</div>
    <div class="amount-words-text">${amountInWordsFormatted}</div>
  </div>`;
}

export interface FooterSignature {
  label: string;
  name?: string | null;
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

function renderSignature({ label, name }: FooterSignature): string {
  return `<div class="signature">
    <div class="signature-line"></div>
    ${name ? `<div class="signature-name">${name}</div>` : ""}
    <div class="signature-label">${label}</div>
  </div>`;
}

export function buildSignatures(
  business: { signatoryName: string | null; signatoryTitle: string | null },
  showTotals: boolean,
): FooterSignature[] {
  if (!showTotals) {
    return [{ label: "Dispatched by", name: business.signatoryName }, { label: "Received by" }];
  }
  return [{ label: business.signatoryTitle ?? "Authorized signature", name: business.signatoryName }];
}

export function renderFooterBar(options: {
  business: FooterBusiness;
  dark: string;
  documentNumber: string;
  showPaymentInstructions: boolean;
  signatures: FooterSignature[];
}): string {
  const { business, dark, documentNumber, showPaymentInstructions, signatures } = options;
  const hasBankDetails = Boolean(business.bankName || business.bankAccountNumber);

  const leftHtml =
    showPaymentInstructions && hasBankDetails
      ? `<div class="footer-payment">
          <div class="footer-payment-title">Payment instructions</div>
          ${business.bankName ? `<div>Bank: ${business.bankName}</div>` : ""}
          <div>Account name: ${business.name}</div>
          ${business.bankAccountNumber ? `<div>Account no: ${business.bankAccountNumber}</div>` : ""}
          <div>Reference: ${documentNumber}</div>
        </div>`
      : `<div class="footer-contact">${[
          business.phone,
          business.email,
          business.tin ? `TIN ${business.tin}` : null,
          business.rraEbmNumber,
        ]
          .filter((value): value is string => Boolean(value))
          .join("&nbsp;&nbsp;&bull;&nbsp;&nbsp;")}</div>`;

  return `<div class="footer-bar" style="background:${dark}">
    ${leftHtml}
    <div class="signatures">${signatures.map(renderSignature).join("")}</div>
  </div>`;
}
