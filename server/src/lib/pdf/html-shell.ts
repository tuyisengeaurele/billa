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
${extraStyles}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
