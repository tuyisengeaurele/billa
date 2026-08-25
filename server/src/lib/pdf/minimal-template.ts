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

const STYLES = `
@page { size: A4; margin: 18mm; }
.logo { height: 14mm; margin-bottom: 4mm; }
.header { display: flex; justify-content: space-between; align-items: flex-start; }
.business-name { font-family: "Fraunces", serif; font-size: 18px; font-weight: 600; }
.doc-meta { text-align: right; }
.doc-type { font-family: "Fraunces", serif; font-size: 17px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.06em; }
.doc-number { color: #6b7280; margin-top: 2px; }
.rule { height: 2px; margin: 6mm 0 8mm; }
.parties { display: flex; justify-content: space-between; margin-bottom: 8mm; }
.party-label { color: #6b7280; text-transform: uppercase; font-size: 9px; letter-spacing: 0.12em; font-weight: 700; margin-bottom: 2mm; }
th { text-align: left; font-weight: 700; color: #374151; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; padding-bottom: 2mm; border-bottom: 2px solid var(--dark); }
td { padding: 3mm 0; border-bottom: 1px solid #f3f4f6; }
td.num, th.num { text-align: right; }
.totals { display: flex; justify-content: flex-end; margin-top: 6mm; }
.totals-box { width: 60mm; }
.totals-row { display: flex; justify-content: space-between; padding: 1mm 0; color: #4b5563; }
.totals-row.total { font-weight: 700; font-size: 13px; color: #111827; border-top: 1px solid #e5e7eb; margin-top: 2mm; padding-top: 2mm; background: none !important; }
.notes { margin-top: 10mm; color: #6b7280; font-size: 10px; }
${PREMIUM_STYLES}
`;

export function renderMinimalHtml(data: PdfRenderData): string {
  const dark = data.business.darkColor;

  const linesHtml = data.lines
    .map(
      (line) => `<tr>
        <td>${line.description}</td>
        <td class="num">${line.quantity}</td>
        <td class="num">${line.unitPriceFormatted}</td>
        <td class="num">${line.taxRateFormatted}</td>
        <td class="num">${line.lineTotalFormatted}</td>
      </tr>`,
    )
    .join("");

  const body = `
    <div style="--accent:${data.business.accentColor}; --dark:${dark}">
      <div class="header">
        <div>
          ${data.business.logoDataUri ? `<img class="logo" src="${data.business.logoDataUri}" />` : ""}
          <div class="business-name">${data.business.name}</div>
        </div>
        <div class="doc-meta">
          <div class="doc-type">${data.typeLabel}</div>
          <div class="doc-number">${data.number ?? "DRAFT"}</div>
          <div class="doc-number">${data.issueDate}</div>
          <div style="margin-top:2mm">${renderStatusPill(data.status)}</div>
        </div>
      </div>
      <div class="rule" style="background:${data.business.accentColor}"></div>
      <div class="parties">
        <div>
          <div class="party-label">${data.partyLabel}</div>
          <div>${data.customer.name}</div>
          ${data.customer.address ? `<div>${data.customer.address}</div>` : ""}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="num">Qty</th>
            <th class="num">Unit price</th>
            <th class="num">Tax</th>
            <th class="num">Amount</th>
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
              dark,
            })}</div>
      ${data.amountInWordsFormatted ? renderAmountInWordsBox(data.amountInWordsFormatted) : ""}`
          : ""
      }
      ${data.notes ? `<div class="notes">${data.notes}</div>` : ""}
      ${renderFooterBar({
        business: data.business,
        dark,
        documentNumber: data.number ?? "DRAFT",
        showPaymentInstructions: data.showTotals,
        signatures: buildSignatures(data.business, data.showTotals),
      })}
    </div>
  `;

  return htmlDocumentShell(data.number ?? "Draft", STYLES, body);
}
