import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { documentListQuerySchema, documentSchema } from "@billa/shared";
import type { DocumentInput, DocumentListQuery } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody } from "../middleware/validate.js";
import { validateQuery } from "../middleware/validate-query.js";
import { calculateDocumentTotals } from "../lib/document-totals.js";
import { DEFAULT_PREFIXES } from "../lib/document-sequences.js";
import { buildPdfRenderData } from "../lib/pdf/render-data.js";
import { renderDocumentPdf } from "../lib/pdf/render-document-pdf.js";

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

const DOCUMENT_INCLUDE = {
  lines: { orderBy: { sortOrder: "asc" as const } },
  customer: { select: { name: true } },
};

documentsRouter.get("/", validateQuery(documentListQuerySchema), async (req, res) => {
  const query = req.listQuery as DocumentListQuery;
  const businessId = req.auth!.businessId;

  const where: Prisma.DocumentWhereInput = {
    businessId,
    type: query.type,
    ...(query.search
      ? {
          OR: [
            { number: { contains: query.search, mode: "insensitive" } },
            { customer: { name: { contains: query.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [results, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder } as Prisma.DocumentOrderByWithRelationInput,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { customer: { select: { name: true } } },
    }),
    prisma.document.count({ where }),
  ]);

  res.json({ results, total, page: query.page, pageSize: query.pageSize });
});

documentsRouter.post("/", validateBody(documentSchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const body = req.body as DocumentInput;
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  const totals = calculateDocumentTotals(body.lines);

  const document = await prisma.document.create({
    data: {
      businessId,
      type: body.type,
      status: "DRAFT",
      template: business!.defaultTemplate,
      customerId: body.customerId,
      issueDate: new Date(body.issueDate),
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      notes: body.notes,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      lines: {
        create: body.lines.map((line, index) => ({
          itemId: line.itemId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRate: line.taxRate,
          lineTotal: totals.lines[index].lineTotal,
          sortOrder: index,
        })),
      },
    },
    include: DOCUMENT_INCLUDE,
  });

  res.status(201).json({ document });
});

documentsRouter.get("/:id", async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const document = await prisma.document.findFirst({
    where: { id, businessId },
    include: DOCUMENT_INCLUDE,
  });

  if (!document) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  res.json({ document });
});

documentsRouter.get("/:id/pdf", async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const document = await prisma.document.findFirst({
    where: { id, businessId },
    include: { lines: { orderBy: { sortOrder: "asc" } }, customer: true },
  });
  if (!document) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  const data = await buildPdfRenderData(document, business!);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderDocumentPdf(document.template, data);
  } catch {
    res.status(500).json({ error: "pdf_render_failed" });
    return;
  }

  const filename = document.number ? `${document.number}.pdf` : `Draft-${document.id.slice(0, 8)}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(pdfBuffer);
});

documentsRouter.patch("/:id", validateBody(documentSchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;
  const body = req.body as DocumentInput;

  const existing = await prisma.document.findFirst({ where: { id, businessId } });
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (existing.status === "FINALIZED") {
    res.status(409).json({ error: "already_finalized" });
    return;
  }

  const totals = calculateDocumentTotals(body.lines);

  const document = await prisma.$transaction(async (tx) => {
    await tx.documentLine.deleteMany({ where: { documentId: id } });
    return tx.document.update({
      where: { id },
      data: {
        type: body.type,
        customerId: body.customerId,
        issueDate: new Date(body.issueDate),
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        lines: {
          create: body.lines.map((line, index) => ({
            itemId: line.itemId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxRate: line.taxRate,
            lineTotal: totals.lines[index].lineTotal,
            sortOrder: index,
          })),
        },
      },
      include: DOCUMENT_INCLUDE,
    });
  });

  res.json({ document });
});

documentsRouter.post("/:id/finalize", async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const document = await prisma.document.findFirst({ where: { id, businessId }, include: { lines: true } });
  if (!document) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (document.status === "FINALIZED") {
    res.status(409).json({ error: "already_finalized" });
    return;
  }
  if (document.lines.length === 0) {
    res.status(400).json({ error: "no_lines" });
    return;
  }

  const finalized = await prisma.$transaction(async (tx) => {
    const existingSequence = await tx.documentSequence.findUnique({
      where: { businessId_type: { businessId, type: document.type } },
    });

    const assignedNumber = existingSequence ? existingSequence.nextNumber : 1;
    const prefix = existingSequence ? existingSequence.prefix : DEFAULT_PREFIXES[document.type];

    await tx.documentSequence.upsert({
      where: { businessId_type: { businessId, type: document.type } },
      create: { businessId, type: document.type, prefix, nextNumber: assignedNumber + 1 },
      update: { nextNumber: assignedNumber + 1 },
    });

    return tx.document.update({
      where: { id },
      data: {
        number: `${prefix}${String(assignedNumber).padStart(4, "0")}`,
        status: "FINALIZED",
      },
      include: DOCUMENT_INCLUDE,
    });
  });

  res.json({ document: finalized });
});

documentsRouter.delete("/:id", async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const existing = await prisma.document.findFirst({ where: { id, businessId } });
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (existing.status === "FINALIZED") {
    res.status(409).json({ error: "already_finalized" });
    return;
  }

  await prisma.$transaction([
    prisma.documentLine.deleteMany({ where: { documentId: id } }),
    prisma.document.delete({ where: { id } }),
  ]);

  res.status(204).send();
});
