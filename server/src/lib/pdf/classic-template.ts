import { htmlDocumentShell } from "./html-shell.js";
import {
  buildSignatures,
  PREMIUM_STYLES,
  renderAmountInWordsBox,
  renderFooterBar,
  renderStatusPill,
  renderTotalsBox,
} from "./premium-parts.js";
import type { PdfRenderData } from "./render-data.js";

// A formal, traditional layout for businesses that want the document itself
// to look like a printed form: serif throughout, ruled borders, sharp
// corners, and the business's accent color used only as a single thin rule
// rather than filled color blocks (unlike Minimal/Premium).
const NEUTRAL_DARK = "#1f2937";

const STYLES = `
@page { size: A4; margin: 20mm; }
* { font-family: "Lora", serif; }
.letterhead { text-align: center; padding-bottom: 6mm; border-bottom: 3px double #1f2937; margin-bottom: 6mm; }
.logo { height: 16mm; margin: 0 auto 4mm; display: block; }
.business-name { font-size: 20px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.business-contact { margin-top: 2mm; font-size: 10px; color: #4b5563; }
.doc-meta-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6mm; }
.doc-type { font-size: 15px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
.doc-number { margin-top: 1mm; font-size: 11px; color: #374151; }
.rule { height: 1px; margin-top: 2mm; width: 100%; }
.parties { display: flex; border: 1px solid #1f2937; margin-bottom: 6mm; }
.party-cell { flex: 1; padding: 4mm 5mm; }
.party-cell + .party-cell { border-left: 1px solid #1f2937; }
.party-label { font-size: 9px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 2mm; }
table.items { border: 1px solid #1f2937; border-collapse: collapse; }
table.items th, table.items td { border: 1px solid #1f2937; padding: 2.5mm 3mm; }
table.items th { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; text-align: left; }
td.num, th.num { text-align: right; }
.totals { display: flex; justify-content: flex-end; margin-top: 6mm; }
.totals-box { width: 65mm; border: 1px solid #1f2937; }
.totals-row { display: flex; justify-content: space-between; padding: 2mm 4mm; color: #374151; border-top: 1px solid #e5e7eb; }
.totals-row:first-child { border-top: none; }
.totals-row.total { font-weight: 700; color: #ffffff; border-top: 1px solid #1f2937; }
.notes { margin-top: 8mm; padding-top: 4mm; border-top: 1px solid #d1d5db; color: #4b5563; font-size: 10px; }
${PREMIUM_STYLES}
`;

export function renderClassicHtml(data: PdfRenderData): string {
  const business = data.business;

  const linesHtml = data.lines
    .map(
      (line) => `<tr>
        <td>${line.description}${line.discountFormatted ? `<br/><span style="font-size:9px;color:#6b7280">${line.discountFormatted}</span>` : ""}</td>
        <td class="num">${line.quantity}</td>
        <td class="num">${line.unitPriceFormatted}</td>
        <td class="num">${line.taxRateFormatted}</td>
        <td class="num">${line.lineTotalFormatted}</td>
      </tr>`,
    )
    .join("");

  const body = `
    <div>
      <div class="letterhead">
        ${business.logoDataUri ? `<img class="logo" src="${business.logoDataUri}" />` : ""}
        <div class="business-name">${business.name}</div>
        <div class="business-contact">${[business.address, business.phone, business.email]
          .filter((value): value is string => Boolean(value))
          .join("&nbsp;&nbsp;&bull;&nbsp;&nbsp;")}</div>
      </div>

      <div class="doc-meta-row">
        <div class="doc-type">${data.typeLabel}</div>
        <div style="text-align:right">
          <div class="doc-number">${data.number ?? "DRAFT"} &nbsp;&bull;&nbsp; ${data.issueDate}</div>
          ${data.dueDateLabel && data.dueDate ? `<div class="doc-number">${data.dueDateLabel}: ${data.dueDate}</div>` : ""}
          ${data.customerReference ? `<div class="doc-number">${data.labels.reference}: ${data.customerReference}</div>` : ""}
          <div style="margin-top:2mm">${renderStatusPill(data.status, data.labels)}</div>
        </div>
      </div>
      <div class="rule" style="background:${business.accentColor}"></div>

      <div class="parties" style="margin-top:6mm">
        <div class="party-cell">
          <div class="party-label">${data.labels.company}</div>
          <div>${business.name}</div>
          ${business.tin ? `<div>${data.labels.tin}: ${business.tin}</div>` : ""}
        </div>
        <div class="party-cell">
          <div class="party-label">${data.partyLabel}</div>
          <div>${data.customer.name}</div>
          ${data.customer.address ? `<div>${data.customer.address}</div>` : ""}
          ${data.customer.tin ? `<div>${data.labels.tin}: ${data.customer.tin}</div>` : ""}
        </div>
      </div>

      <table class="items">
        <thead>
          <tr>
            <th>${data.labels.description}</th>
            <th class="num">${data.labels.qty}</th>
            <th class="num">${data.labels.unitPrice}</th>
            <th class="num">${data.labels.tax}</th>
            <th class="num">${data.labels.total}</th>
          </tr>
        </thead>
        <tbody>${linesHtml}</tbody>
      </table>

      ${
        data.showTotals
          ? `<div class="totals">${renderTotalsBox({
              subtotalFormatted: data.subtotalFormatted,
              taxTotalFormatted: data.taxTotalFormatted,
              totalFormatted: data.totalFormatted,
              dark: NEUTRAL_DARK,
              labels: data.labels,
            })}</div>
      ${data.amountInWordsFormatted ? renderAmountInWordsBox(data.amountInWordsFormatted, data.labels) : ""}`
          : ""
      }
      ${data.notes ? `<div class="notes">${data.labels.notes}: ${data.notes}</div>` : ""}
      ${renderFooterBar({
        business,
        dark: NEUTRAL_DARK,
        documentNumber: data.number ?? "DRAFT",
        showPaymentInstructions: data.showTotals,
        signatures: buildSignatures(business, data.showTotals, data.labels),
        labels: data.labels,
      })}
    </div>
  `;

  return htmlDocumentShell(data.number ?? "Draft", STYLES, body);
}
