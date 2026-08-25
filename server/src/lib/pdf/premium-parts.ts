import { darkenUntilContrast } from "../color.js";

export const PREMIUM_STYLES = `
.status-pill { display: inline-block; padding: 1mm 3mm; border-radius: 999px; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
.amount-words { margin-top: 6mm; border: 1px solid #d1d5db; border-radius: 2mm; padding: 3mm 4mm; }
.amount-words-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.12em; color: #6b7280; font-weight: 700; margin-bottom: 1mm; }
.amount-words-text { font-weight: 600; }
.footer-bar { margin-top: 10mm; padding: 6mm 8mm; border-radius: 2mm; color: #ffffff; display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm; }
.footer-contact { font-size: 9px; opacity: 0.9; }
.signatures { display: flex; gap: 10mm; }
.signature { text-align: center; min-width: 32mm; }
.signature-line { border-bottom: 1px solid #ffffff; margin-bottom: 1.5mm; height: 8mm; }
.signature-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; }
`;

export function accentDark(accentColor: string): string {
  return darkenUntilContrast(accentColor, 7, "#FFFFFF").hex;
}

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

interface FooterBusiness {
  phone: string | null;
  email: string | null;
  tin: string | null;
  rraEbmNumber: string | null;
}

export function renderFooterBar(business: FooterBusiness, dark: string, signatureLabels: string[]): string {
  const contactParts = [
    business.phone,
    business.email,
    business.tin ? `TIN ${business.tin}` : null,
    business.rraEbmNumber,
  ].filter((value): value is string => Boolean(value));

  const signatures = signatureLabels
    .map(
      (label) => `<div class="signature">
        <div class="signature-line"></div>
        <div class="signature-label">${label}</div>
      </div>`,
    )
    .join("");

  return `<div class="footer-bar" style="background:${dark}">
    <div class="footer-contact">${contactParts.join("&nbsp;&nbsp;&bull;&nbsp;&nbsp;")}</div>
    <div class="signatures">${signatures}</div>
  </div>`;
}
