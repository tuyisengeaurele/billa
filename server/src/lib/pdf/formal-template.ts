import { htmlDocumentShell } from "./html-shell.js";
import type { PdfRenderData } from "./render-data.js";

const STYLES = `
@page { size: A4; margin: 18mm; }
.logo { height: 12mm; margin-bottom: 3mm; }
.letterhead { background: color-mix(in srgb, var(--accent) 12%, white); padding: 6mm; display: flex; justify-content: space-between; align-items: center; border-radius: 2mm; }
.business-name { font-family: "Fraunces", serif; font-size: 17px; font-weight: 700; }
.doc-title { font-family: "Fraunces", serif; font-size: 20px; font-weight: 700; text-align: right; text-transform: uppercase; letter-spacing: 0.05em; }
.meta-row { display: flex; gap: 6mm; margin: 8mm 0; }
.meta-box { flex: 1; border: 1px solid #d1d5db; border-radius: 2mm; padding: 4mm; }
.meta-box-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 2mm; font-weight: 600; }
th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; padding: 3mm; border: 1px solid #d1d5db; background: color-mix(in srgb, var(--accent) 10%, white); }
td { padding: 3mm; border: 1px solid #d1d5db; }
td.num, th.num { text-align: right; }
.totals { display: flex; justify-content: flex-end; margin-top: 6mm; }
.totals-box { width: 65mm; border: 1px solid #d1d5db; border-radius: 2mm; overflow: hidden; }
.totals-row { display: flex; justify-content: space-between; padding: 2mm 4mm; }
.totals-row.total { font-weight: 700; font-size: 13px; background: color-mix(in srgb, var(--accent) 15%, white); }
.notes { margin-top: 10mm; color: #6b7280; font-size: 10px; }
`;

export function renderFormalHtml(data: PdfRenderData): string {
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
    <div style="--accent:${data.business.accentColor}">
      <div class="letterhead">
        <div>
          ${data.business.logoDataUri ? `<img class="logo" src="${data.business.logoDataUri}" />` : ""}
          <div class="business-name">${data.business.name}</div>
          ${data.business.address ? `<div>${data.business.address}</div>` : ""}
        </div>
        <div class="doc-title">${data.typeLabel}</div>
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
      <div class="totals">
        <div class="totals-box">
          <div class="totals-row"><span>Subtotal</span><span>${data.subtotalFormatted}</span></div>
          <div class="totals-row"><span>Tax</span><span>${data.taxTotalFormatted}</span></div>
          <div class="totals-row total"><span>Total</span><span>${data.totalFormatted}</span></div>
        </div>
      </div>
      ${data.notes ? `<div class="notes">${data.notes}</div>` : ""}
    </div>
  `;

  return htmlDocumentShell(data.number ?? "Draft", STYLES, body);
}
