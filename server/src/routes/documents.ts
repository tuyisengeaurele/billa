import { Router } from "express";
import multer from "multer";
import type { Prisma } from "@prisma/client";
import * as Sentry from "@sentry/node";
import {
  createPaymentSchema,
  documentListQuerySchema,
  documentSchema,
  markDocumentSharedSchema,
  DOCUMENT_LANGUAGES,
  getPdfLabels,
  minorPerMajor,
  updateDocumentRemindersSchema,
  updatePublicLinkSchema,
  voidPaymentSchema,
  writeOffInvoiceSchema,
  type Currency,
} from "@billa/shared";
import type {
  CreatePaymentInput,
  DocumentInput,
  DocumentListQuery,
  MarkDocumentSharedInput,
  UpdatePublicLinkInput,
  UpdateDocumentRemindersInput,
  VoidPaymentInput,
  WriteOffInvoiceInput,
} from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireBusinessContext } from "../middleware/require-business.js";
import { requireActiveSubscription } from "../middleware/require-active-subscription.js";
import { validateBody } from "../middleware/validate.js";
import { validateQuery } from "../middleware/validate-query.js";
import { calculateDocumentTotals } from "../lib/document-totals.js";
import { DEFAULT_PREFIXES } from "../lib/document-sequences.js";
import { buildPdfRenderData } from "../lib/pdf/render-data.js";
import { renderDocumentPdf } from "../lib/pdf/render-document-pdf.js";
import { sendDocumentEmail } from "../lib/mailer.js";
import { buildDocumentSendEmail } from "../lib/email-templates.js";
import { buildPublicAssetUrl } from "../lib/asset-url.js";
import { addInterval, generateDueRecurringDocuments } from "../lib/recurring-documents.js";
import { sendOverdueReminders } from "../lib/overdue-reminders.js";
import { sendQuoteExpiryReminders } from "../lib/quote-expiry-reminders.js";
import { logActivity } from "../lib/activity-log.js";
import { recordJobRun } from "../lib/job-run-log.js";
import { toCsv } from "../lib/csv.js";
import { convertProformaToInvoice } from "../lib/convert-proforma.js";
import { recomputeInvoicePaymentStatus } from "../lib/invoice-payment-status.js";
import { recordInvoicePayment } from "../lib/record-invoice-payment.js";
import { finalizeDocumentById } from "../lib/finalize-document.js";
import { generatePaymentReceipt } from "../lib/generate-payment-receipt.js";
import { installmentRows, planProblem, withSchedule } from "../lib/document-schedule.js";
import { ensureRates, getStoredRates } from "../lib/exchange-rates.js";
import { detectAllowedImageType, detectPdf } from "../lib/file-sniff.js";
import { getStorage } from "../lib/storage.js";
import { requireFinalizePermission } from "../middleware/require-finalize-permission.js";
import { expensiveOperationRateLimit, generalApiRateLimit } from "../middleware/general-rate-limit.js";

export const documentsRouter = Router();

documentsRouter.use(requireAuth);
documentsRouter.use(requireBusinessContext);
documentsRouter.use(generalApiRateLimit);
documentsRouter.use(requireActiveSubscription);

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

const uploadAttachment = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("file");

const MAX_ATTACHMENTS_PER_DOCUMENT = 5;

// Files kept with a document (a purchase order, proof of delivery). They can be added or removed at any
// time, even after finalizing, because they never change what the document says.
documentsRouter.post(
  "/:id/attachments",
  (req, res, next) => {
    uploadAttachment(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: "upload_failed" });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    const businessId = req.auth!.businessId;
    const { id } = req.params;
    if (!req.file) {
      res.status(400).json({ error: "no_file" });
      return;
    }

    const document = await prisma.document.findFirst({ where: { id, businessId }, select: { id: true } });
    if (!document) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const existing = await prisma.documentAttachment.count({ where: { documentId: id } });
    if (existing >= MAX_ATTACHMENTS_PER_DOCUMENT) {
      res.status(409).json({ error: "too_many_attachments" });
      return;
    }

    const image = await detectAllowedImageType(req.file.buffer);
    const isPdf = !image && detectPdf(req.file.buffer);
    if (!image && !isPdf) {
      res.status(400).json({ error: "invalid_file_type" });
      return;
    }

    const { url } = await getStorage().save(req.file.buffer, businessId, image ? image.ext : "pdf");
    const fileName = (req.file.originalname.split(/[/\\]/).pop() ?? "").trim().slice(0, 120) || "attachment";
    const attachment = await prisma.documentAttachment.create({
      data: {
        documentId: id,
        businessId,
        fileName,
        url,
        contentType: image ? image.mime : "application/pdf",
        sizeBytes: req.file.size,
        uploadedById: req.auth!.userId,
      },
    });
    res.status(201).json({ attachment });
  },
);

documentsRouter.delete("/:id/attachments/:attachmentId", async (req, res) => {
  const { id, attachmentId } = req.params;
  const attachment = await prisma.documentAttachment.findFirst({
    where: { id: attachmentId, documentId: id, businessId: req.auth!.businessId },
  });
  if (!attachment) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  await prisma.documentAttachment.delete({ where: { id: attachment.id } });
  res.status(204).end();
});

const DOCUMENT_INCLUDE = {
  lines: { orderBy: { sortOrder: "asc" as const } },
  installments: { orderBy: { sortOrder: "asc" as const } },
  attachments: { orderBy: { createdAt: "asc" as const } },
  customer: { select: { name: true, email: true, phone: true } },
  business: { select: { momoEnabled: true } },
  convertedFrom: { select: { id: true, number: true, type: true } },
  convertedTo: { select: { id: true, number: true, type: true } },
  referencedDocument: { select: { id: true, number: true, type: true } },
};

type ReferencedDocumentResult =
  | { ok: true; referencedDocumentId: string | null; currency?: { currency: string; exchangeRate: number | null } }
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

  return {
    ok: true,
    referencedDocumentId,
    currency: { currency: referenced.currency, exchangeRate: referenced.exchangeRate },
  };
}

// A document that refers to an invoice is always in the invoice's currency, at the invoice's rate.
function currencyFields(
  body: DocumentInput,
  referenced: { currency?: { currency: string; exchangeRate: number | null } },
) {
  if (referenced.currency) return referenced.currency;
  return { currency: body.currency, exchangeRate: body.currency === "RWF" ? null : (body.exchangeRate ?? null) };
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

documentsRouter.post("/expiring/send-reminders", async (req, res) => {
  try {
    const sent = await sendQuoteExpiryReminders(req.auth!.businessId);
    await recordJobRun("quote-expiry-reminders", { succeeded: true, resultCount: sent.length });
    res.json({ sent });
  } catch (err) {
    await recordJobRun("quote-expiry-reminders", {
      succeeded: false,
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
    res.status(500).json({ error: "job_failed" });
  }
});

function buildDocumentsWhere(businessId: string, query: DocumentListQuery): Prisma.DocumentWhereInput {
  return {
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
}

documentsRouter.get("/", validateQuery(documentListQuerySchema), async (req, res) => {
  const query = req.listQuery as DocumentListQuery;
  const businessId = req.auth!.businessId;

  const where = buildDocumentsWhere(businessId, query);

  const [results, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortOrder } as Prisma.DocumentOrderByWithRelationInput,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { customer: { select: { name: true, email: true } } },
    }),
    prisma.document.count({ where }),
  ]);

  res.json({ results, total, page: query.page, pageSize: query.pageSize });
});

// The rate to prefill for each foreign currency: the bank's latest reference rate, or failing that
// the rate this business used last. "info" says which, so the form can tell the user where it came from.
documentsRouter.get("/rates", async (req, res) => {
  await ensureRates();
  const stored = await getStoredRates();
  const recent = await prisma.document.findMany({
    where: { businessId: req.auth!.businessId, currency: { not: "RWF" }, exchangeRate: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { currency: true, exchangeRate: true },
    take: 200,
  });
  const rates: Record<string, number> = {};
  const info: Record<string, { source: string; date: string | null }> = {};
  for (const [currency, row] of Object.entries(stored)) {
    rates[currency] = row.rate;
    info[currency] = { source: row.source, date: row.rateDate.toISOString().slice(0, 10) };
  }
  for (const document of recent) {
    if (!(document.currency in rates) && document.exchangeRate) {
      rates[document.currency] = document.exchangeRate;
      info[document.currency] = { source: "LAST_USED", date: null };
    }
  }
  res.json({ rates, info });
});

documentsRouter.get("/export.csv", expensiveOperationRateLimit, validateQuery(documentListQuerySchema), async (req, res) => {
  const query = req.listQuery as DocumentListQuery;
  const businessId = req.auth!.businessId;

  const documents = await prisma.document.findMany({
    where: buildDocumentsWhere(businessId, query),
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
      total: doc.total / minorPerMajor(doc.currency as Currency),
      currency: doc.currency,
    })),
    [
      { key: "type", header: "Type" },
      { key: "number", header: "Number" },
      { key: "status", header: "Status" },
      { key: "customer", header: "Customer" },
      { key: "issueDate", header: "Issue date" },
      { key: "dueDate", header: "Due date" },
      { key: "total", header: "Total" },
      { key: "currency", header: "Currency" },
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

  const problem = planProblem(totals.total, body.installments);
  if (problem) {
    res.status(400).json({ error: "invalid_installments", message: problem });
    return;
  }
  const plan = body.installments ? installmentRows(body.installments) : null;

  const document = await prisma.document.create({
    data: {
      businessId,
      type: body.type,
      status: "DRAFT",
      template: business!.defaultTemplate,
      language: body.language,
      customerId: body.customerId,
      issueDate: new Date(body.issueDate),
      // With a plan, the invoice as a whole falls due when its last instalment does.
      dueDate: plan ? plan.finalDueDate : body.dueDate ? new Date(body.dueDate) : null,
      notes: body.notes,
      customerReference: body.customerReference,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      ...currencyFields(body, referenced),
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
      installments: plan ? { create: plan.create } : undefined,
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

  res.json({ document: await withSchedule(document) });
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

  const requestedLanguage = req.query.language;
  if (requestedLanguage !== undefined) {
    if (typeof requestedLanguage !== "string" || !DOCUMENT_LANGUAGES.includes(requestedLanguage as never)) {
      res.status(400).json({ error: "invalid_language" });
      return;
    }
    if (requestedLanguage !== document.language) {
      document.language = requestedLanguage as typeof document.language;
      await prisma.document.update({ where: { id }, data: { language: document.language } });
    }
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

  const requestedLanguage = (req.body as { language?: unknown })?.language;
  if (requestedLanguage !== undefined) {
    if (typeof requestedLanguage !== "string" || !DOCUMENT_LANGUAGES.includes(requestedLanguage as never)) {
      res.status(400).json({ error: "invalid_language" });
      return;
    }
    if (requestedLanguage !== document.language) {
      document.language = requestedLanguage as typeof document.language;
      await prisma.document.update({ where: { id }, data: { language: document.language } });
    }
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

  const typeLabel = getPdfLabels(document.language).typeLabels[document.type];
  const filename = document.number ? `${document.number}.pdf` : `Draft-${document.id.slice(0, 8)}.pdf`;
  const sender = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  const { subject, html } = buildDocumentSendEmail({
    language: document.language,
    customerName: document.customer.name,
    typeLabel,
    number: document.number,
    businessName: business!.name,
    businessAddress: business!.address,
    businessPhone: business!.phone,
    businessEmail: business!.email,
    businessLogoUrl: buildPublicAssetUrl(business!.logoUrl),
    sender: sender ? { name: sender.name, phone: sender.phone, email: sender.email } : null,
    viewUrl: `${clientOrigin}/view/${document.publicToken}`,
    payable: document.type === "INVOICE" && business!.momoEnabled,
  });

  try {
    await sendDocumentEmail({
      to: document.customer.email,
      subject,
      html,
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

documentsRouter.post("/:id/shared", validateBody(markDocumentSharedSchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;
  const body = req.body as MarkDocumentSharedInput;

  const document = await prisma.document.findFirst({ where: { id, businessId } });
  if (!document) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (document.status !== "FINALIZED") {
    res.status(409).json({ error: "not_finalized" });
    return;
  }

  const updated = await prisma.document.update({ where: { id }, data: { sentAt: new Date() } });
  await logActivity({
    businessId,
    actorUserId: req.auth!.userId,
    action: "DOCUMENT_SHARED",
    entityType: "Document",
    entityId: id,
    metadata: { channel: body.channel, type: document.type, number: document.number },
  });
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

  const problem = planProblem(totals.total, body.installments);
  if (problem) {
    res.status(400).json({ error: "invalid_installments", message: problem });
    return;
  }
  const plan = body.installments ? installmentRows(body.installments) : null;

  const document = await prisma.$transaction(async (tx) => {
    await tx.documentLine.deleteMany({ where: { documentId: id } });
    await tx.documentInstalment.deleteMany({ where: { documentId: id } });
    return tx.document.update({
      where: { id },
      data: {
        type: body.type,
        language: body.language,
        customerId: body.customerId,
        issueDate: new Date(body.issueDate),
        dueDate: plan ? plan.finalDueDate : body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes,
        customerReference: body.customerReference,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        ...currencyFields(body, referenced),
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
        installments: plan ? { create: plan.create } : undefined,
      },
      include: DOCUMENT_INCLUDE,
    });
  });

  res.json({ document });
});

documentsRouter.patch("/:id/public-link", validateBody(updatePublicLinkSchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;
  const { enabled } = req.body as UpdatePublicLinkInput;

  const document = await prisma.document.findFirst({ where: { id, businessId } });
  if (!document) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (document.status !== "FINALIZED") {
    res.status(409).json({ error: "not_finalized" });
    return;
  }

  const isDisabled = document.publicLinkDisabledAt !== null;
  if (isDisabled === !enabled) {
    res.json({ publicLinkDisabledAt: document.publicLinkDisabledAt });
    return;
  }

  const updated = await prisma.document.update({
    where: { id },
    data: { publicLinkDisabledAt: enabled ? null : new Date() },
  });
  await logActivity({
    businessId,
    actorUserId: req.auth!.userId,
    action: enabled ? "DOCUMENT_LINK_ENABLED" : "DOCUMENT_LINK_DISABLED",
    entityType: "Document",
    entityId: id,
    metadata: { type: document.type, number: document.number },
  });
  res.json({ publicLinkDisabledAt: updated.publicLinkDisabledAt });
});

documentsRouter.patch("/:id/reminders", validateBody(updateDocumentRemindersSchema), async (req, res) => {
  const businessId = req.auth!.businessId;
  const { id } = req.params;
  const body = req.body as UpdateDocumentRemindersInput;

  const existing = await prisma.document.findFirst({ where: { id, businessId } });
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const document = await prisma.document.update({
    where: { id },
    data: { remindersEnabled: body.enabled },
    include: DOCUMENT_INCLUDE,
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

  const payment = await recordInvoicePayment({
    businessId,
    documentId: id,
    amount: body.amount,
    method: body.method,
    paidOn: new Date(body.paidOn),
    createdByUserId: req.auth!.userId,
    notes: body.notes,
    referenceNumber: body.referenceNumber,
    payerName: body.payerName,
    receiptImageUrl: body.receiptImageUrl,
  });

  const receiptDocumentId = body.generateReceipt
    ? await generatePaymentReceipt({
        businessId,
        invoiceId: id,
        paymentId: payment.id,
        amount: body.amount,
        method: body.method,
        paidOn: new Date(body.paidOn),
      })
    : null;

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
