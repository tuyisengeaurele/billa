import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { documentListQuerySchema, documentSchema } from "@billa/shared";
import type { DocumentInput, DocumentListQuery } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireActiveSubscription } from "../middleware/require-active-subscription.js";
import { validateBody } from "../middleware/validate.js";
import { validateQuery } from "../middleware/validate-query.js";
import { calculateDocumentTotals } from "../lib/document-totals.js";
import { DEFAULT_PREFIXES } from "../lib/document-sequences.js";
import { buildPdfRenderData } from "../lib/pdf/render-data.js";
import { renderDocumentPdf } from "../lib/pdf/render-document-pdf.js";
import { sendDocumentEmail } from "../lib/resend.js";
import { addInterval, generateDueRecurringDocuments } from "../lib/recurring-documents.js";
import { sendOverdueReminders } from "../lib/overdue-reminders.js";
import { logActivity } from "../lib/activity-log.js";
import { recordJobRun } from "../lib/job-run-log.js";
import { toCsv } from "../lib/csv.js";
import { convertProformaToInvoice } from "../lib/convert-proforma.js";

export const documentsRouter = Router();

documentsRouter.use(requireAuth);
documentsRouter.use(requireActiveSubscription);

const DOCUMENT_INCLUDE = {
  lines: { orderBy: { sortOrder: "asc" as const } },
  customer: { select: { name: true, email: true } },
  convertedFrom: { select: { id: true, number: true, type: true } },
  convertedTo: { select: { id: true, number: true, type: true } },
  referencedDocument: { select: { id: true, number: true, type: true } },
};

type ReferencedDocumentResult =
  | { ok: true; referencedDocumentId: string | null }
  | { ok: false; error: string };

async function resolveReferencedDocument(
  businessId: string,
  referencedDocumentId: string | null | undefined,
): Promise<ReferencedDocumentResult> {
  if (!referencedDocumentId) {
    return { ok: true, referencedDocumentId: null };
  }

  const referenced = await prisma.document.findFirst({ where: { id: referencedDocumentId, businessId } });
  if (!referenced) {
    return { ok: false, error: "referenced_document_not_found" };
  }
  if (referenced.type !== "INVOICE") {
    return { ok: false, error: "referenced_document_not_an_invoice" };
  }
  if (referenced.status !== "FINALIZED") {
    return { ok: false, error: "referenced_document_not_finalized" };
  }

  return { ok: true, referencedDocumentId };
}

function recurrenceFields(body: DocumentInput) {
  if (!body.recurrence) {
    return { recurrenceInterval: null, recurrenceEndDate: null, nextRecurrenceAt: null };
  }
  return {
    recurrenceInterval: body.recurrence.interval,
    recurrenceEndDate: body.recurrence.endDate ? new Date(body.recurrence.endDate) : null,
    nextRecurrenceAt: addInterval(new Date(body.issueDate), body.recurrence.interval),
  };
}

documentsRouter.post("/recurring/generate-due", async (req, res) => {
  try {
    const generated = await generateDueRecurringDocuments(req.auth!.businessId);
    await recordJobRun("recurring-documents", { succeeded: true, resultCount: generated.length });
    res.json({ generated });
  } catch (err) {
    await recordJobRun("recurring-documents", {
      succeeded: false,
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
    res.status(500).json({ error: "job_failed" });
  }
});

documentsRouter.post("/overdue/send-reminders", async (req, res) => {
  try {
    const sent = await sendOverdueReminders(req.auth!.businessId);
    await recordJobRun("overdue-reminders", { succeeded: true, resultCount: sent.length });
    res.json({ sent });
  } catch (err) {
    await recordJobRun("overdue-reminders", {
      succeeded: false,
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
    res.status(500).json({ error: "job_failed" });
  }
});

documentsRouter.get("/", validateQuery(documentListQuerySchema), async (req, res) => {
  const query = req.listQuery as DocumentListQuery;
  const businessId = req.auth!.businessId;

  const where: Prisma.DocumentWhereInput = {
    businessId,
    ...(query.type && query.type.length > 0 ? { type: { in: query.type } } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          issueDate: {
            ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
            ...(query.dateTo ? { lt: new Date(new Date(query.dateTo).getTime() + 24 * 60 * 60 * 1000) } : {}),
          },
        }
      : {}),
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

documentsRouter.get("/export.csv", async (req, res) => {
  const businessId = req.auth!.businessId;

  const documents = await prisma.document.findMany({
    where: { businessId },
    orderBy: { issueDate: "desc" },
    include: { customer: { select: { name: true } } },
  });

  const csv = toCsv(
    documents.map((doc) => ({
      type: doc.type,
      number: doc.number ?? "Draft",
      status: doc.status,
      customer: doc.customer.name,
      issueDate: doc.issueDate.toISOString().slice(0, 10),
      dueDate: doc.dueDate ? doc.dueDate.toISOString().slice(0, 10) : "",
      total: doc.total,
    })),
    [
      { key: "type", header: "Type" },
      { key: "number", header: "Number" },
      { key: "status", header: "Status" },
      { key: "customer", header: "Customer" },
      { key: "issueDate", header: "Issue date" },
      { key: "dueDate", header: "Due date" },
      { key: "total", header: "Total" },
    ],
  );

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="documents.csv"');
  res.send(csv);
});

documentsRouter.post("/", validateBody(documentSchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const body = req.body as DocumentInput;

  const referenced = await resolveReferencedDocument(businessId, body.referencedDocumentId);
  if (!referenced.ok) {
    res.status(400).json({ error: referenced.error });
    return;
  }

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
      referencedDocumentId: referenced.referencedDocumentId,
      ...recurrenceFields(body),
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

  await logActivity({
    businessId,
    actorUserId: req.auth!.userId,
    action: "DOCUMENT_CREATED",
    entityType: "Document",
    entityId: document.id,
    metadata: { type: document.type },
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

const DOCUMENT_TYPE_DISPLAY: Record<string, string> = {
  INVOICE: "Invoice",
  PROFORMA: "Proforma invoice",
  DELIVERY_NOTE: "Delivery note",
  QUOTE: "Quote",
  RECEIPT: "Receipt",
  CREDIT_NOTE: "Credit note",
};

documentsRouter.post("/:id/send", async (req, res) => {
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
  if (document.status !== "FINALIZED") {
    res.status(409).json({ error: "not_finalized" });
    return;
  }
  if (!document.customer.email) {
    res.status(400).json({ error: "customer_has_no_email" });
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

  const typeLabel = DOCUMENT_TYPE_DISPLAY[document.type];
  const filename = document.number ? `${document.number}.pdf` : `Draft-${document.id.slice(0, 8)}.pdf`;

  try {
    await sendDocumentEmail({
      to: document.customer.email,
      subject: `${typeLabel} ${document.number} from ${business!.name}`,
      html: `<p>Hello ${document.customer.name},</p><p>Please find your ${typeLabel.toLowerCase()} ${document.number} from ${business!.name} attached.</p>`,
      attachmentFilename: filename,
      attachmentBuffer: pdfBuffer,
    });
  } catch {
    res.status(502).json({ error: "email_send_failed" });
    return;
  }

  const updated = await prisma.document.update({ where: { id }, data: { sentAt: new Date() } });
  res.json({ sentAt: updated.sentAt });
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

  const referenced = await resolveReferencedDocument(businessId, body.referencedDocumentId);
  if (!referenced.ok) {
    res.status(400).json({ error: referenced.error });
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
        referencedDocumentId: referenced.referencedDocumentId,
        ...recurrenceFields(body),
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

  await logActivity({
    businessId,
    actorUserId: req.auth!.userId,
    action: "DOCUMENT_FINALIZED",
    entityType: "Document",
    entityId: finalized.id,
    metadata: { number: finalized.number, type: finalized.type },
  });

  res.json({ document: finalized });
});

documentsRouter.post("/:id/convert", async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const result = await convertProformaToInvoice({ id, businessId });
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  const invoice = await prisma.document.findUnique({ where: { id: result.invoice.id }, include: DOCUMENT_INCLUDE });
  res.status(201).json({ document: invoice });
});

documentsRouter.post("/:id/duplicate", async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const source = await prisma.document.findFirst({
    where: { id, businessId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  const totals = calculateDocumentTotals(
    source.lines.map((line) => ({
      quantity: Number(line.quantity),
      unitPrice: line.unitPrice,
      taxRate: Number(line.taxRate),
    })),
  );

  const duplicate = await prisma.document.create({
    data: {
      businessId,
      type: source.type,
      status: "DRAFT",
      template: business!.defaultTemplate,
      customerId: source.customerId,
      issueDate: new Date(new Date().toISOString().slice(0, 10)),
      notes: source.notes,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      referencedDocumentId: source.referencedDocumentId,
      lines: {
        create: source.lines.map((line, index) => ({
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

  await logActivity({
    businessId,
    actorUserId: req.auth!.userId,
    action: "DOCUMENT_CREATED",
    entityType: "Document",
    entityId: duplicate.id,
    metadata: { type: duplicate.type, duplicatedFrom: source.id },
  });

  res.status(201).json({ document: duplicate });
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

  await logActivity({
    businessId,
    actorUserId: req.auth!.userId,
    action: "DOCUMENT_DELETED",
    entityType: "Document",
    entityId: existing.id,
    metadata: { type: existing.type },
  });

  res.status(204).send();
});
