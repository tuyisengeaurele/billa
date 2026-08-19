import type { DocumentTemplate } from "@prisma/client";
import { renderMinimalHtml } from "./minimal-template.js";
import { renderFormalHtml } from "./formal-template.js";
import { renderSidebarAccentHtml } from "./sidebar-accent-template.js";
import { renderHtmlToPdfBuffer } from "./browser.js";
import type { PdfRenderData } from "./render-data.js";

export function renderDocumentToHtml(template: DocumentTemplate, data: PdfRenderData): string {
  switch (template) {
    case "MINIMAL":
      return renderMinimalHtml(data);
    case "FORMAL":
      return renderFormalHtml(data);
    case "SIDEBAR_ACCENT":
      return renderSidebarAccentHtml(data);
  }
}

export async function renderDocumentPdf(template: DocumentTemplate, data: PdfRenderData): Promise<Buffer> {
  const html = renderDocumentToHtml(template, data);
  return renderHtmlToPdfBuffer(html);
}
