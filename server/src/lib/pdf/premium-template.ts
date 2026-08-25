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
@page { size: A4; margin: 0; }
body { background: #eef0f4; padding: 10mm 0; }
.card { max-width: 182mm; margin: 0 auto; background: #ffffff; border-radius: 3mm; overflow: hidden; box-shadow: 0 2mm 6mm rgba(0, 0, 0, 0.12); }
.letterhead { display: flex; justify-content: space-between; align-items: flex-start; padding: 8mm 14mm; border-bottom: 2px solid var(--dark); }
.logo { height: 12mm; margin-bottom: 3mm; }
.business-name { font-family: "Fraunces", serif; font-size: 17px; font-weight: 700; }
.doc-title-block { text-align: right; }
.doc-title { font-family: "Fraunces", serif; font-size: 22px; font-weight: 700; text-align: right; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); }
.doc-number { color: #6b7280; margin-top: 1mm; }
.content { padding: 0 14mm; }
.meta-row { display: flex; gap: 6mm; margin: 8mm 0; }
.meta-box { flex: 1; border: 1px solid #d1d5db; border-radius: 2mm; padding: 4mm; }
.meta-box-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: #6b7280; margin-bottom: 2mm; font-weight: 700; }
th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; padding: 3mm; background: var(--dark); color: #ffffff; }
th.idx, td.idx { width: 9mm; }
td { padding: 3mm; border-bottom: 1px solid #f3f4f6; }
tbody tr:nth-child(even) { background: #fafafa; }
td.num, th.num { text-align: right; }
.totals { display: flex; justify-content: flex-end; margin-top: 6mm; }
.totals-box { width: 65mm; border: 1px solid #d1d5db; border-radius: 2mm; overflow: hidden; }
.totals-row { display: flex; justify-content: space-between; padding: 2mm 4mm; }
.totals-row.total { font-weight: 700; font-size: 13px; color: #ffffff; }
.notes { margin: 8mm 0; color: #6b7280; font-size: 10px; }
.disclaimer { background: #f8f8f8; border-top: 1px solid #eee; padding: 3mm 14mm; font-size: 9px; color: #9ca3af; text-align: center; }
${PREMIUM_STYLES}
`;

export function renderPremiumHtml(data: PdfRenderData): string {
  const dark = data.business.darkColor;

  const linesHtml = data.lines
    .map(
      (line, i) => `<tr>
        <td class="idx">${String(i + 1).padStart(2, "0")}</td>
        <td>${line.description}</td>
        <td class="num">${line.quantity}</td>
        <td class="num">${line.unitPriceFormatted}</td>
        <td class="num">${line.taxRateFormatted}</td>
        <td class="num">${line.lineTotalFormatted}</td>
      </tr>`,
    )
    .join("");

  const body = `
    <div class="card" style="--accent:${data.business.accentColor}; --dark:${dark}">
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
      <div class="content">
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
              <th class="idx">#</th>
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
      </div>
      ${renderFooterBar({
        business: data.business,
        dark,
        documentNumber: data.number ?? "DRAFT",
        showPaymentInstructions: data.showTotals,
        signatures: buildSignatures(data.business, data.showTotals),
      })}
      <div class="disclaimer">
        This is a document issued by ${data.business.name}. All amounts in Rwandan Francs (RWF).
        ${data.dueDateLabel && data.dueDate ? `&nbsp;&bull;&nbsp;${data.dueDateLabel}: ${data.dueDate}` : ""}
      </div>
    </div>
  `;

  return htmlDocumentShell(data.number ?? "Draft", STYLES, body);
}
