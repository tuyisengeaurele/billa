import { FONT_FACE_CSS } from "./assets.js";

export function htmlDocumentShell(title: string, extraStyles: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
${FONT_FACE_CSS}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: "Plus Jakarta Sans", sans-serif;
  color: #1f2937;
  font-size: 11px;
  line-height: 1.5;
}
table { width: 100%; border-collapse: collapse; }
.qr-block { max-width: 880px; margin: 6mm auto 0; display: flex; justify-content: flex-end; align-items: center; gap: 3mm; break-inside: avoid; }
.qr-block img { width: 22mm; height: 22mm; }
.qr-block span { font-size: 9px; color: #6b7280; max-width: 30mm; text-align: right; }
${extraStyles}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/** A small "scan to view online" QR code that sits under the document. Empty for a draft, which has no public page. */
export function renderQrBlock(data: { qrDataUri: string | null; labels: { scanToView: string } }): string {
  if (!data.qrDataUri) return "";
  return `<div class="qr-block"><span>${data.labels.scanToView}</span><img src="${data.qrDataUri}" alt="" /></div>`;
}
