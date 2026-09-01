import { Router } from "express";
import multer from "multer";
import type { Prisma } from "@prisma/client";
import * as Sentry from "@sentry/node";
import {
  createPaymentSchema,
  documentListQuerySchema,
  documentSchema,
  voidPaymentSchema,
  writeOffInvoiceSchema,
} from "@billa/shared";
import type {
  CreatePaymentInput,
  DocumentInput,
  DocumentListQuery,
  VoidPaymentInput,
  WriteOffInvoiceInput,
} from "@billa/shared";
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
import { recomputeInvoicePaymentStatus } from "../lib/invoice-payment-status.js";
import { finalizeDocumentById } from "../lib/finalize-document.js";
import { createNotification } from "../lib/notifications.js";
import { detectAllowedImageType } from "../lib/file-sniff.js";
import { getStorage } from "../lib/storage.js";
import { blockAccountantMutations } from "../middleware/block-accountant-mutations.js";
import { requireFinalizePermission } from "../middleware/require-finalize-permission.js";

export const documentsRouter = Router();

documentsRouter.use(requireAuth);
documentsRouter.use(requireActiveSubscription);
documentsRouter.use(blockAccountantMutations);

const uploadPaymentReceipt = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("receipt");

documentsRouter.post(
  "/payments/receipt",
  (req, res, next) => {
    uploadPaymentReceipt(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: "upload_failed" });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "no_file" });
      return;
    }

    const detected = await detectAllowedImageType(req.file.buffer);
    if (!detected) {
      res.status(400).json({ error: "invalid_file_type" });
      return;
    }

    const { url } = await getStorage().save(req.file.buffer, req.auth!.businessId, detected.ext);
    res.status(201).json({ url });
  },
);

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
  customerId: string,
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
  if (referenced.customerId !== customerId) {
    return { ok: false, error: "referenced_document_wrong_customer" };
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

  const referenced = await resolveReferencedDocument(businessId, body.referencedDocumentId, body.customerId);
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
      language: body.language,
      customerId: body.customerId,
      issueDate: new Date(body.issueDate),
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      notes: body.notes,
      customerReference: body.customerReference,
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
          discountType: line.discountType ?? null,
          discountValue: line.discountValue ?? null,
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
  } catch (err) {
    Sentry.captureException(err);
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
  } catch (err) {
    Sentry.captureException(err);
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
  } catch (err) {
    Sentry.captureException(err);
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

  const referenced = await resolveReferencedDocument(businessId, body.referencedDocumentId, body.customerId);
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
        language: body.language,
        customerId: body.customerId,
        issueDate: new Date(body.issueDate),
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes,
        customerReference: body.customerReference,
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
            discountType: line.discountType ?? null,
            discountValue: line.discountValue ?? null,
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

documentsRouter.post("/:id/finalize", requireFinalizePermission, async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const result = await finalizeDocumentById(businessId, id);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  await logActivity({
    businessId,
    actorUserId: req.auth!.userId,
    action: "DOCUMENT_FINALIZED",
    entityType: "Document",
    entityId: result.document.id,
    metadata: { number: result.document.number, type: result.document.type },
  });

  if (result.document.type === "INVOICE") {
    await recomputeInvoicePaymentStatus(result.document.id);
  }
  if (result.document.type === "CREDIT_NOTE" && result.document.referencedDocumentId) {
    await recomputeInvoicePaymentStatus(result.document.referencedDocumentId);
  }

  const finalized = await prisma.document.findUnique({ where: { id: result.document.id }, include: DOCUMENT_INCLUDE });
  res.json({ document: finalized });
});

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  MOBILE_MONEY: "Mobile Money",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

documentsRouter.post("/:id/payments", validateBody(createPaymentSchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;
  const body = req.body as CreatePaymentInput;

  const invoice = await prisma.document.findFirst({ where: { id, businessId } });
  if (!invoice) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (invoice.type !== "INVOICE") {
    res.status(400).json({ error: "not_an_invoice" });
    return;
  }
  if (invoice.status !== "FINALIZED") {
    res.status(409).json({ error: "not_finalized" });
    return;
  }

  const creditNotes = await prisma.document.findMany({
    where: { referencedDocumentId: id, type: "CREDIT_NOTE", status: "FINALIZED" },
  });
  const creditedTotal = creditNotes.reduce((sum, doc) => sum + doc.total, 0);
  const amountOwed = invoice.total - creditedTotal - invoice.amountPaid;

  if (body.amount > amountOwed) {
    res.status(400).json({ error: "amount_exceeds_owed" });
    return;
  }

  const payment = await prisma.invoicePayment.create({
    data: {
      businessId,
      documentId: id,
      amount: body.amount,
      method: body.method,
      paidOn: new Date(body.paidOn),
      notes: body.notes,
      referenceNumber: body.referenceNumber,
      payerName: body.payerName,
      receiptImageUrl: body.receiptImageUrl,
      createdByUserId: req.auth!.userId,
    },
  });

  let receiptDocumentId: string | null = null;
  if (body.generateReceipt) {
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    const totals = calculateDocumentTotals([{ quantity: 1, unitPrice: body.amount, taxRate: 0 }]);
    const draftReceipt = await prisma.document.create({
      data: {
        businessId,
        type: "RECEIPT",
        status: "DRAFT",
        template: business!.defaultTemplate,
        customerId: invoice.customerId,
        issueDate: new Date(body.paidOn),
        referencedDocumentId: id,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        lines: {
          create: [
            {
              description: `Payment received (${PAYMENT_METHOD_LABELS[body.method] ?? body.method})`,
              quantity: 1,
              unitPrice: body.amount,
              taxRate: 0,
              lineTotal: totals.lines[0].lineTotal,
              sortOrder: 0,
            },
          ],
        },
      },
    });

    const finalizedReceipt = await finalizeDocumentById(businessId, draftReceipt.id);
    if (finalizedReceipt.ok) {
      receiptDocumentId = finalizedReceipt.document.id;
      await prisma.invoicePayment.update({ where: { id: payment.id }, data: { receiptDocumentId } });
    }
  }

  await recomputeInvoicePaymentStatus(id);

  const owningBusiness = await prisma.business.findUnique({ where: { id: businessId }, select: { ownerId: true } });
  if (owningBusiness) {
    await createNotification({
      userId: owningBusiness.ownerId,
      type: "PAYMENT_RECEIVED",
      title: `Payment received for ${invoice.number ?? "an invoice"}`,
      link: `/documents/${id}`,
    });
  }

  const updatedInvoice = await prisma.document.findUnique({ where: { id }, include: DOCUMENT_INCLUDE });
  res.status(201).json({ payment: { ...payment, receiptDocumentId }, document: updatedInvoice });
});

documentsRouter.post(
  "/:id/payments/:paymentId/void",
  validateBody(voidPaymentSchema),
  async (req, res) => {
    const businessId = req.auth!.businessId;
    const { id, paymentId } = req.params;
    const body = req.body as VoidPaymentInput;

    const payment = await prisma.invoicePayment.findFirst({ where: { id: paymentId, documentId: id, businessId } });
    if (!payment) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (payment.voidedAt) {
      res.status(409).json({ error: "already_voided" });
      return;
    }

    await prisma.invoicePayment.update({
      where: { id: paymentId },
      data: { voidedAt: new Date(), voidReason: body.voidReason },
    });
    await recomputeInvoicePaymentStatus(id);

    const updatedInvoice = await prisma.document.findUnique({ where: { id }, include: DOCUMENT_INCLUDE });
    res.json({ document: updatedInvoice });
  },
);

documentsRouter.get("/:id/payments", async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const invoice = await prisma.document.findFirst({ where: { id, businessId } });
  if (!invoice) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const payments = await prisma.invoicePayment.findMany({
    where: { documentId: id },
    orderBy: { paidOn: "desc" },
  });
  res.json({ payments });
});

documentsRouter.post("/:id/write-off", validateBody(writeOffInvoiceSchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;
  const body = req.body as WriteOffInvoiceInput;

  const invoice = await prisma.document.findFirst({ where: { id, businessId } });
  if (!invoice) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (invoice.type !== "INVOICE") {
    res.status(400).json({ error: "not_an_invoice" });
    return;
  }
  if (invoice.paymentStatus === "PAID") {
    res.status(409).json({ error: "already_paid" });
    return;
  }

  const updated = await prisma.document.update({
    where: { id },
    data: { paymentStatus: "WRITTEN_OFF", writtenOffAt: new Date(), writeOffReason: body.writeOffReason },
    include: DOCUMENT_INCLUDE,
  });
  res.json({ document: updated });
});

documentsRouter.post("/:id/reactivate", async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;

  const invoice = await prisma.document.findFirst({ where: { id, businessId } });
  if (!invoice) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (invoice.paymentStatus !== "WRITTEN_OFF") {
    res.status(409).json({ error: "not_written_off" });
    return;
  }

  await prisma.document.update({
    where: { id },
    data: { writtenOffAt: null, writeOffReason: null, paymentStatus: null },
  });
  await recomputeInvoicePaymentStatus(id);

  const updated = await prisma.document.findUnique({ where: { id }, include: DOCUMENT_INCLUDE });
  res.json({ document: updated });
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
      discountType: line.discountType,
      discountValue: line.discountValue ? Number(line.discountValue) : null,
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
      customerReference: source.customerReference,
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
          discountType: line.discountType,
          discountValue: line.discountValue,
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
