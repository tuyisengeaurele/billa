import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function readFontAsBase64(specifier: string): string {
  const filePath = require.resolve(specifier);
  return readFileSync(filePath).toString("base64");
}

const FRAUNCES_BASE64 = readFontAsBase64(
  "@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2",
);
const PLUS_JAKARTA_SANS_BASE64 = readFontAsBase64(
  "@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2",
);
const LORA_BASE64 = readFontAsBase64("@fontsource-variable/lora/files/lora-latin-wght-normal.woff2");

export const FONT_FACE_CSS = `
@font-face {
  font-family: "Fraunces";
  src: url(data:font/woff2;base64,${FRAUNCES_BASE64}) format("woff2");
  font-weight: 300 900;
  font-style: normal;
}
@font-face {
  font-family: "Plus Jakarta Sans";
  src: url(data:font/woff2;base64,${PLUS_JAKARTA_SANS_BASE64}) format("woff2");
  font-weight: 200 800;
  font-style: normal;
}
@font-face {
  font-family: "Lora";
  src: url(data:font/woff2;base64,${LORA_BASE64}) format("woff2");
  font-weight: 400 700;
  font-style: normal;
}
`;
