import type { DocumentTemplate } from "@prisma/client";
import { renderClassicHtml } from "./classic-template.js";
import { renderMinimalHtml } from "./minimal-template.js";
import { renderPremiumHtml } from "./premium-template.js";
import { renderHtmlToPdfBuffer } from "./browser.js";
import type { PdfRenderData } from "./render-data.js";

export function renderDocumentToHtml(template: DocumentTemplate, data: PdfRenderData): string {
  switch (template) {
    case "MINIMAL":
      return renderMinimalHtml(data);
    case "PREMIUM":
      return renderPremiumHtml(data);
    case "CLASSIC":
      return renderClassicHtml(data);
  }
}

export async function renderDocumentPdf(template: DocumentTemplate, data: PdfRenderData): Promise<Buffer> {
  const html = renderDocumentToHtml(template, data);
  return renderHtmlToPdfBuffer(html);
}
