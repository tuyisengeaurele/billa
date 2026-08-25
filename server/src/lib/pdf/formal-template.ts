import { htmlDocumentShell } from "./html-shell.js";
import { accentDark, PREMIUM_STYLES, renderAmountInWordsBox, renderFooterBar, renderStatusPill, renderTotalsBox } from "./premium-parts.js";
import type { PdfRenderData } from "./render-data.js";

const STYLES = `
@page { size: A4; margin: 18mm; }
.logo { height: 12mm; margin-bottom: 3mm; }
.letterhead { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--dark); padding-bottom: 5mm; }
.business-name { font-family: "Fraunces", serif; font-size: 17px; font-weight: 700; }
.doc-title-block { text-align: right; }
.doc-title { font-family: "Fraunces", serif; font-size: 22px; font-weight: 700; text-align: right; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); }
.doc-number { color: #6b7280; margin-top: 1mm; }
.meta-row { display: flex; gap: 6mm; margin: 8mm 0; }
.meta-box { flex: 1; border: 1px solid #d1d5db; border-radius: 2mm; padding: 4mm; }
.meta-box-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: #6b7280; margin-bottom: 2mm; font-weight: 700; }
th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; padding: 3mm; background: var(--dark); color: #ffffff; }
td { padding: 3mm; border: 1px solid #e5e7eb; border-top: none; }
td.num, th.num { text-align: right; }
.totals { display: flex; justify-content: flex-end; margin-top: 6mm; }
.totals-box { width: 65mm; border: 1px solid #d1d5db; border-radius: 2mm; overflow: hidden; }
.totals-row { display: flex; justify-content: space-between; padding: 2mm 4mm; }
.totals-row.total { font-weight: 700; font-size: 13px; color: #ffffff; }
.notes { margin-top: 10mm; color: #6b7280; font-size: 10px; }
${PREMIUM_STYLES}
`;

export function renderFormalHtml(data: PdfRenderData): string {
  const dark = accentDark(data.business.accentColor);

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
      <div class="letterhead">
        <div>
          ${data.business.logoDataUri ? `<img class="logo" src="${data.business.logoDataUri}" />` : ""}
          <div class="business-name">${data.business.name}</div>
          ${data.business.address ? `<div>${data.business.address}</div>` : ""}
        </div>
        <div class="doc-title-block">
          <div class="doc-title">${data.typeLabel}</div>
          <div class="doc-number">${data.number ?? "DRAFT"}</div>
          <div style="margin-top:2mm">${renderStatusPill(data.status)}</div>
        </div>
      </div>
      <div class="meta-row">
        <div class="meta-box">
          <div class="meta-box-label">${data.partyLabel}</div>
          <div>${data.customer.name}</div>
          ${data.customer.address ? `<div>${data.customer.address}</div>` : ""}
        </div>
        <div class="meta-box">
          <div class="meta-box-label">Document details</div>
          <div>No: ${data.number ?? "DRAFT"}</div>
          <div>Issued: ${data.issueDate}</div>
          ${data.dueDateLabel && data.dueDate ? `<div>${data.dueDateLabel}: ${data.dueDate}</div>` : ""}
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
      ${renderFooterBar(data.business, dark, data.showTotals ? ["Authorized signature"] : ["Dispatched by", "Received by"])}
    </div>
  `;

  return htmlDocumentShell(data.number ?? "Draft", STYLES, body);
}
