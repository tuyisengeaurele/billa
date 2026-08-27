import { htmlDocumentShell } from "./html-shell.js";
import type { PdfRenderData } from "./render-data.js";

const STYLES = `
@page { size: A4; margin: 0; }
body { background: #eef0f4; padding: 30px 0; }
.page { max-width: 880px; margin: 0 auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 6px 32px rgba(0, 0, 0, 0.13); }

.hd { background: #fff; padding: 24px 36px; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-bottom: 2px solid var(--dark); }
.hd-left { display: flex; flex-direction: column; gap: 10px; }
.logo { max-height: 60px; max-width: 160px; object-fit: contain; }
.hd-company { color: #666; font-size: 11.5px; line-height: 1.65; margin-top: 4px; }
.hd-company strong { display: block; font-size: 15px; font-weight: 700; color: #1a1a2e; letter-spacing: 0.3px; margin-bottom: 3px; }
.hd-right { text-align: right; flex-shrink: 0; }
.doc-word { font-family: "Fraunces", serif; font-size: 32px; font-weight: 800; color: var(--accent); letter-spacing: 3px; line-height: 1; }
.doc-num { font-size: 16px; font-weight: 700; color: #1a1a2e; margin-top: 10px; }
.doc-dates { margin-top: 6px; }
.doc-dates td { font-size: 11.5px; color: #888; padding: 1.5px 0; }
.doc-dates td:first-child { padding-right: 12px; opacity: 0.7; }
.doc-dates td:last-child { font-weight: 600; color: #1a1a2e; }
.status-pill { display: inline-block; margin-top: 8px; padding: 3px 10px; border-radius: 20px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }

.addr-row { display: flex; border-bottom: 1.5px solid #f0f0f0; }
.addr-cell { flex: 1; padding: 18px 36px; }
.addr-cell + .addr-cell { border-left: 1px solid #f0f0f0; }
.addr-lbl { font-size: 9.5px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--accent); margin-bottom: 9px; }
.addr-tbl td { font-size: 12.5px; padding: 2.5px 0; vertical-align: top; }
.addr-tbl td:first-child { color: #999; width: 85px; }
.addr-tbl td:last-child { font-weight: 600; color: #1a1a2e; padding-left: 8px; }

.tbl-wrap { padding: 22px 36px 0; }
.tbl-title { font-size: 9.5px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
table.items { width: 100%; border-collapse: collapse; }
table.items thead tr { background: var(--dark); }
table.items thead th { color: #fff; font-size: 10.5px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; padding: 11px 14px; text-align: left; }
table.items thead th.r { text-align: right; }
table.items tbody tr:nth-child(even) { background: color-mix(in srgb, var(--accent) 4%, white); }
table.items tbody td { padding: 14px 14px; border-bottom: 1px solid #f0eeec; font-size: 13px; vertical-align: top; }
table.items tbody td.r { text-align: right; font-weight: 600; color: #1a1a2e; }
.prod-name { font-weight: 700; color: #1a1a2e; }

.totals-wrap { padding: 18px 36px 22px; display: flex; justify-content: flex-end; }
.totals-box { width: 320px; border: 1px solid #f0eeec; border-radius: 8px; overflow: hidden; }
.totals-box table { width: 100%; border-collapse: collapse; }
.totals-box table td { padding: 9px 16px; font-size: 13px; border-bottom: 1px solid #f5f5f5; }
.totals-box table tr:last-child td { border-bottom: none; }
.tot-lbl { color: #888; }
.tot-val { text-align: right; font-weight: 600; }
.grand td { background: var(--dark) !important; color: #fff !important; font-size: 15px !important; font-weight: 700 !important; padding: 12px 16px !important; }

.words-row { margin: 0 36px; border: 1px solid #f0eeec; border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; }
.words-lbl { font-size: 9px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent); margin-bottom: 3px; }
.words-val { font-size: 12px; font-style: italic; color: #333; line-height: 1.4; }

.notes-row { margin: 0 36px 20px; border-left: 3px solid var(--accent); padding: 8px 14px; background: color-mix(in srgb, var(--accent) 4%, white); }
.notes-lbl { font-size: 9px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent); margin-bottom: 3px; }
.notes-val { font-size: 12px; color: #444; line-height: 1.5; }

.ft { border-top: 2px solid var(--dark); padding: 18px 36px; display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; }
.ft-bank { font-size: 11px; color: #6b7280; line-height: 1.75; }
.ft-bank strong { display: block; font-size: 9.5px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent); margin-bottom: 6px; }
.ft-sig { text-align: right; }
.sig-name { border-top: 1px solid #d1d5db; margin-top: 32px; padding-top: 7px; font-size: 12px; font-weight: 700; color: #1a1a2e; white-space: nowrap; }
.sig-title { font-size: 10.5px; color: #6b7280; margin-top: 2px; }
.sig-company { font-size: 10.5px; color: #9ca3af; margin-top: 1px; }

.disclaimer { background: #f8f8f8; border-top: 1px solid #eee; padding: 9px 36px; font-size: 10px; color: #999; text-align: center; line-height: 1.5; }

@media print {
  body { background: #fff; }
  .page { box-shadow: none; margin: 0; border-radius: 0; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

export function renderPremiumHtml(data: PdfRenderData): string {
  const business = data.business;

  const itemRows = data.lines
    .map(
      (line, i) => `<tr>
        <td>${String(i + 1).padStart(2, "0")}</td>
        <td><div class="prod-name">${line.description}</div>${line.discountFormatted ? `<div style="font-size:10px;color:#6b7280">${line.discountFormatted}</div>` : ""}</td>
        <td class="r">${line.quantity}</td>
        <td class="r">${line.unitPriceFormatted}</td>
        <td class="r">${line.taxRateFormatted}</td>
        <td class="r">${line.lineTotalFormatted}</td>
      </tr>`,
    )
    .join("");

  const totalsRows = `
    <tr><td class="tot-lbl">Subtotal</td><td class="tot-val">${data.subtotalFormatted}</td></tr>
    <tr><td class="tot-lbl">Tax</td><td class="tot-val">${data.taxTotalFormatted}</td></tr>
    <tr class="grand"><td>Total</td><td style="text-align:right;">${data.totalFormatted}</td></tr>
  `;

  const hasSignatory = Boolean(business.signatoryName);
  const hasBankDetails = Boolean(business.bankName || business.bankAccountNumber);

  const footerLeft =
    data.showTotals && hasBankDetails
      ? `<div class="ft-bank">
          <strong>Payment Instructions</strong>
          ${business.bankName ? `Bank: ${business.bankName}<br/>` : ""}
          Account Name: ${business.name}<br/>
          ${business.bankAccountNumber ? `Account No: ${business.bankAccountNumber}<br/>` : ""}
          Reference: ${data.number ?? "DRAFT"}
        </div>`
      : `<div class="ft-bank">
          ${business.phone ? `Tel: ${business.phone}<br/>` : ""}
          ${business.email ? `Email: ${business.email}<br/>` : ""}
          ${business.rraEbmNumber ?? ""}
        </div>`;

  const signatureBlocks = data.showTotals
    ? `<div class="ft-sig">
        <div class="sig-name">${hasSignatory ? business.signatoryName : "Authorized signature"}</div>
        <div class="sig-title">${business.signatoryTitle ?? ""}</div>
        <div class="sig-company">${business.name}</div>
      </div>`
    : `<div style="display:flex; gap:32px;">
        <div class="ft-sig">
          <div class="sig-name">${hasSignatory ? business.signatoryName : "&nbsp;"}</div>
          <div class="sig-title">Dispatched by</div>
        </div>
        <div class="ft-sig">
          <div class="sig-name">&nbsp;</div>
          <div class="sig-title">Received by</div>
        </div>
      </div>`;

  const body = `
    <div class="page" style="--accent:${business.accentColor}; --dark:${business.darkColor}">
      <div class="hd">
        <div class="hd-left">
          ${business.logoDataUri ? `<img class="logo" src="${business.logoDataUri}" />` : ""}
          <div class="hd-company">
            <strong>${business.name}</strong>
            ${business.address ? `${business.address}<br/>` : ""}
            ${business.tin ? `TIN: ${business.tin}<br/>` : ""}
            ${business.phone || business.email ? `${business.phone ?? ""}${business.phone && business.email ? "&nbsp;&nbsp;|&nbsp;&nbsp;" : ""}${business.email ?? ""}` : ""}
          </div>
        </div>
        <div class="hd-right">
          <div class="doc-word">${data.typeLabel}</div>
          <div class="doc-num">${data.number ?? "DRAFT"}</div>
          <table class="doc-dates">
            <tr><td>Issued:</td><td>${data.issueDate}</td></tr>
            ${data.dueDateLabel && data.dueDate ? `<tr><td>${data.dueDateLabel}:</td><td>${data.dueDate}</td></tr>` : ""}
            ${data.customerReference ? `<tr><td>Reference:</td><td>${data.customerReference}</td></tr>` : ""}
          </table>
          <div class="status-pill" style="background:${data.status === "FINALIZED" ? "#e6f4ea" : "#f3f4f6"}; color:${data.status === "FINALIZED" ? "#1e7d32" : "#6b7280"}">
            ${data.status === "FINALIZED" ? "Finalized" : "Draft"}
          </div>
        </div>
      </div>

      <div class="addr-row">
        <div class="addr-cell">
          <div class="addr-lbl">From (Seller)</div>
          <table class="addr-tbl">
            <tr><td>Company:</td><td>${business.name}</td></tr>
            ${business.tin ? `<tr><td>TIN:</td><td>${business.tin}</td></tr>` : ""}
            ${business.bankName ? `<tr><td>Bank:</td><td>${business.bankName}</td></tr>` : ""}
            ${business.bankAccountNumber ? `<tr><td>Acc. No:</td><td>${business.bankAccountNumber}</td></tr>` : ""}
            ${business.phone ? `<tr><td>Tel:</td><td>${business.phone}</td></tr>` : ""}
            ${business.email ? `<tr><td>Email:</td><td>${business.email}</td></tr>` : ""}
          </table>
        </div>
        <div class="addr-cell">
          <div class="addr-lbl">${data.partyLabel}</div>
          <table class="addr-tbl">
            <tr><td>Name:</td><td>${data.customer.name}</td></tr>
            ${data.customer.tin ? `<tr><td>TIN:</td><td>${data.customer.tin}</td></tr>` : ""}
            ${data.customer.phone ? `<tr><td>Contact:</td><td>${data.customer.phone}</td></tr>` : ""}
            ${data.customer.address ? `<tr><td>Location:</td><td>${data.customer.address}</td></tr>` : ""}
            <tr><td>Currency:</td><td>RWF (Rwandan Franc)</td></tr>
          </table>
        </div>
      </div>

      <div class="tbl-wrap">
        <div class="tbl-title">Line Items</div>
        <table class="items">
          <thead>
            <tr>
              <th style="width:28px;">#</th>
              <th>Description</th>
              <th class="r" style="width:70px;">Qty</th>
              <th class="r" style="width:100px;">Unit price</th>
              <th class="r" style="width:60px;">Tax</th>
              <th class="r" style="width:110px;">Total</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>

      ${
        data.showTotals
          ? `<div class="totals-wrap">
              <div class="totals-box">
                <table>${totalsRows}</table>
              </div>
            </div>
            ${
              data.amountInWordsFormatted
                ? `<div class="words-row">
                    <div class="words-lbl">Amount in words</div>
                    <div class="words-val">${data.amountInWordsFormatted} (${data.totalFormatted})</div>
                  </div>`
                : ""
            }`
          : ""
      }

      ${
        data.notes
          ? `<div class="notes-row">
              <div class="notes-lbl">Notes</div>
              <div class="notes-val">${data.notes}</div>
            </div>`
          : ""
      }

      <div class="ft">
        ${footerLeft}
        ${signatureBlocks}
      </div>

      <div class="disclaimer">
        This is a document issued by ${business.name}.
        &nbsp;|&nbsp; All amounts in Rwandan Francs (RWF)
        ${data.dueDateLabel && data.dueDate && data.showTotals ? `&nbsp;|&nbsp; ${data.dueDateLabel}: ${data.dueDate}` : ""}
      </div>
    </div>
  `;

  return htmlDocumentShell(data.number ?? "Draft", STYLES, body);
}
