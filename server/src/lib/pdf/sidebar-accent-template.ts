import { contrastRatio } from "../color.js";
import { htmlDocumentShell } from "./html-shell.js";
import type { PdfRenderData } from "./render-data.js";

function pickSidebarTextColor(accentColor: string): string {
  const whiteContrast = contrastRatio(accentColor, "#FFFFFF");
  const darkContrast = contrastRatio(accentColor, "#1F2937");
  return whiteContrast >= darkContrast ? "#FFFFFF" : "#1F2937";
}

const STYLES = `
@page { size: A4; margin: 0; }
body { display: flex; min-height: 297mm; }
.sidebar { width: 28%; padding: 16mm 8mm; position: fixed; top: 0; bottom: 0; left: 0; }
.main { width: 72%; margin-left: 28%; padding: 16mm; }
.logo { height: 12mm; margin-bottom: 6mm; }
.sidebar-name { font-family: "Fraunces", serif; font-size: 15px; font-weight: 700; margin-bottom: 8mm; }
.sidebar-section { margin-bottom: 8mm; }
.sidebar-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; margin-bottom: 2mm; }
.doc-title { font-family: "Fraunces", serif; font-size: 18px; font-weight: 700; margin-bottom: 8mm; }
.party-label { color: #9ca3af; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; margin-bottom: 2mm; }
th { text-align: left; font-weight: 500; color: #6b7280; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; padding-bottom: 2mm; border-bottom: 1px solid #e5e7eb; }
td { padding: 3mm 0; border-bottom: 1px solid #f3f4f6; }
td.num, th.num { text-align: right; }
.totals { display: flex; justify-content: flex-end; margin-top: 6mm; }
.totals-box { width: 60mm; }
.totals-row { display: flex; justify-content: space-between; padding: 1mm 0; color: #4b5563; }
.totals-row.total { font-weight: 700; font-size: 13px; color: #111827; border-top: 1px solid #e5e7eb; margin-top: 2mm; padding-top: 2mm; }
.notes { margin-top: 10mm; color: #6b7280; font-size: 10px; }
`;

export function renderSidebarAccentHtml(data: PdfRenderData): string {
  const textColor = pickSidebarTextColor(data.business.accentColor);

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
    <div class="sidebar" style="background:${data.business.accentColor}; color:${textColor}">
      ${data.business.logoDataUri ? `<img class="logo" src="${data.business.logoDataUri}" />` : ""}
      <div class="sidebar-name">${data.business.name}</div>
      <div class="sidebar-section">
        <div class="sidebar-label">Contact</div>
        ${data.business.address ? `<div>${data.business.address}</div>` : ""}
        ${data.business.phone ? `<div>${data.business.phone}</div>` : ""}
        ${data.business.email ? `<div>${data.business.email}</div>` : ""}
        ${data.business.tin ? `<div>TIN ${data.business.tin}</div>` : ""}
        ${data.business.rraEbmNumber ? `<div>${data.business.rraEbmNumber}</div>` : ""}
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">${data.typeLabel}</div>
        <div>${data.number ?? "DRAFT"}</div>
        <div>${data.issueDate}</div>
        ${data.dueDateLabel && data.dueDate ? `<div>${data.dueDateLabel} ${data.dueDate}</div>` : ""}
        <div>${data.status}</div>
      </div>
    </div>
    <div class="main">
      <div class="doc-title">${data.typeLabel}</div>
      <div class="party-label">${data.partyLabel}</div>
      <div>${data.customer.name}</div>
      ${data.customer.address ? `<div>${data.customer.address}</div>` : ""}
      <table style="margin-top:8mm">
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
