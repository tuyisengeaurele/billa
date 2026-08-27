import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { buildPdfRenderData } from "../lib/pdf/render-data.js";
import { renderDocumentPdf } from "../lib/pdf/render-document-pdf.js";
import { convertProformaToInvoice, declineDocument } from "../lib/convert-proforma.js";

export const publicDocumentsRouter = Router();

const PUBLIC_DOCUMENT_INCLUDE = {
  lines: { orderBy: { sortOrder: "asc" as const } },
  customer: { select: { name: true, email: true } },
  business: { select: { name: true, logoUrl: true, primaryColor: true, address: true, phone: true, email: true } },
  convertedTo: { select: { id: true } },
};

publicDocumentsRouter.get("/:token/pdf", async (req, res) => {
  const { token } = req.params;

  const document = await prisma.document.findFirst({
    where: { publicToken: token, status: "FINALIZED" },
    include: { lines: { orderBy: { sortOrder: "asc" } }, customer: true },
  });
  if (!document) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const business = await prisma.business.findUnique({ where: { id: document.businessId } });
  const data = await buildPdfRenderData(document, business!);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderDocumentPdf(document.template, data);
  } catch {
    res.status(500).json({ error: "pdf_render_failed" });
    return;
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${document.number}.pdf"`);
  res.send(pdfBuffer);
});

publicDocumentsRouter.post("/:token/accept", async (req, res) => {
  const { token } = req.params;

  const document = await prisma.document.findFirst({ where: { publicToken: token } });
  if (!document) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const result = await convertProformaToInvoice({ id: document.id });
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.status(201).json({ accepted: true });
});

publicDocumentsRouter.post("/:token/decline", async (req, res) => {
  const { token } = req.params;

  const document = await prisma.document.findFirst({ where: { publicToken: token } });
  if (!document) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const result = await declineDocument({ id: document.id });
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.json({ declined: true });
});

publicDocumentsRouter.get("/:token", async (req, res) => {
  const { token } = req.params;

  const document = await prisma.document.findFirst({
    where: { publicToken: token, status: "FINALIZED" },
    include: PUBLIC_DOCUMENT_INCLUDE,
  });
  if (!document) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const { convertedTo, declinedAt, ...documentFields } = document;
  res.json({ document: { ...documentFields, accepted: Boolean(convertedTo), declined: Boolean(declinedAt) } });
});
