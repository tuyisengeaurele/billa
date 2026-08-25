import { contrastRatio } from "../color.js";
import { htmlDocumentShell } from "./html-shell.js";
import { accentDark, PREMIUM_STYLES, renderAmountInWordsBox, renderFooterBar, renderStatusPill, renderTotalsBox } from "./premium-parts.js";
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
.sidebar-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.12em; opacity: 0.75; margin-bottom: 2mm; font-weight: 700; }
.doc-title { font-family: "Fraunces", serif; font-size: 19px; font-weight: 700; margin-bottom: 3mm; color: var(--accent); text-transform: uppercase; letter-spacing: 0.06em; }
.party-label { color: #6b7280; text-transform: uppercase; font-size: 9px; letter-spacing: 0.12em; font-weight: 700; margin-bottom: 2mm; }
th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; padding: 3mm; background: var(--dark); color: #ffffff; }
td { padding: 3mm; border: 1px solid #e5e7eb; border-top: none; }
td.num, th.num { text-align: right; }
.totals { display: flex; justify-content: flex-end; margin-top: 6mm; }
.totals-box { width: 60mm; border: 1px solid #d1d5db; border-radius: 2mm; overflow: hidden; }
.totals-row { display: flex; justify-content: space-between; padding: 2mm 4mm; }
.totals-row.total { font-weight: 700; font-size: 13px; color: #ffffff; }
.notes { margin-top: 10mm; color: #6b7280; font-size: 10px; }
${PREMIUM_STYLES}
`;

export function renderSidebarAccentHtml(data: PdfRenderData): string {
  const textColor = pickSidebarTextColor(data.business.accentColor);
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
        <div style="margin-top:2mm">${renderStatusPill(data.status)}</div>
      </div>
    </div>
    <div class="main" style="--accent:${data.business.accentColor}; --dark:${dark}">
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
