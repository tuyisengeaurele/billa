import { randomUUID } from "node:crypto";
import { Router } from "express";
import { createMomoPaymentRequestSchema } from "@billa/shared";
import type { CreateMomoPaymentRequestInput } from "@billa/shared";
import { prisma } from "../lib/prisma.js";
import { buildPdfRenderData } from "../lib/pdf/render-data.js";
import { renderDocumentPdf } from "../lib/pdf/render-document-pdf.js";
import { convertProformaToInvoice, declineDocument } from "../lib/convert-proforma.js";
import { createNotification } from "../lib/notifications.js";
import { validateBody } from "../middleware/validate.js";
import { momoPollRateLimit, publicDocumentRateLimit } from "../middleware/public-document-rate-limit.js";
import { getInvoiceOutstandingBalance } from "../lib/invoice-payment-status.js";
import { decrypt } from "../lib/encryption.js";
import { getAccessToken, getRequestToPayStatus, MOMO_BASE_URLS, requestToPay } from "../lib/momo-client.js";
import type { MomoCredentials } from "../lib/momo-client.js";
import { recordInvoicePayment } from "../lib/record-invoice-payment.js";

export const publicDocumentsRouter = Router();

const PUBLIC_DOCUMENT_INCLUDE = {
  lines: { orderBy: { sortOrder: "asc" as const } },
  customer: { select: { name: true, email: true, phone: true } },
  business: {
    select: { name: true, logoUrl: true, primaryColor: true, address: true, phone: true, email: true, momoEnabled: true },
  },
  convertedTo: { select: { id: true } },
};

publicDocumentsRouter.get("/:token/pdf", publicDocumentRateLimit, async (req, res) => {
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

publicDocumentsRouter.post("/:token/accept", publicDocumentRateLimit, async (req, res) => {
  const { token } = req.params;

  const document = await prisma.document.findFirst({
    where: { publicToken: token },
    include: { customer: { select: { name: true } }, business: { select: { ownerId: true } } },
  });
  if (!document) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const result = await convertProformaToInvoice({ id: document.id });
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  await createNotification({
    userId: document.business.ownerId,
    type: "DOCUMENT_ACCEPTED",
    title: `${document.customer.name} accepted ${document.number}`,
    body: `${document.customer.name} accepted your ${document.type.toLowerCase()} and it's ready to convert to an invoice.`,
    link: `/documents/${document.id}`,
  });

  res.status(201).json({ accepted: true });
});

publicDocumentsRouter.post("/:token/decline", publicDocumentRateLimit, async (req, res) => {
  const { token } = req.params;

  const document = await prisma.document.findFirst({
    where: { publicToken: token },
    include: { customer: { select: { name: true } }, business: { select: { ownerId: true } } },
  });
  if (!document) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const result = await declineDocument({ id: document.id });
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  await createNotification({
    userId: document.business.ownerId,
    type: "DOCUMENT_DECLINED",
    title: `${document.customer.name} declined ${document.number}`,
    body: `${document.customer.name} declined your ${document.type.toLowerCase()}.`,
    link: `/documents/${document.id}`,
  });

  res.json({ declined: true });
});

publicDocumentsRouter.get("/:token", publicDocumentRateLimit, async (req, res) => {
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

const MOMO_EXPIRY_MS = 5 * 60 * 1000;

function buildMomoCredentials(business: {
  momoEnvironment: string | null;
  momoTargetEnvironment: string | null;
  momoSubscriptionKeyEnc: string | null;
  momoApiUserEnc: string | null;
  momoApiKeyEnc: string | null;
}): MomoCredentials | null {
  if (
    !business.momoEnvironment ||
    !business.momoTargetEnvironment ||
    !business.momoSubscriptionKeyEnc ||
    !business.momoApiUserEnc ||
    !business.momoApiKeyEnc
  ) {
    return null;
  }
  return {
    subscriptionKey: decrypt(business.momoSubscriptionKeyEnc),
    apiUser: decrypt(business.momoApiUserEnc),
    apiKey: decrypt(business.momoApiKeyEnc),
    targetEnvironment: business.momoTargetEnvironment,
    baseUrl: MOMO_BASE_URLS[business.momoEnvironment as "sandbox" | "production"],
  };
}

publicDocumentsRouter.post(
  "/:token/momo/request",
  publicDocumentRateLimit,
  validateBody(createMomoPaymentRequestSchema),
  async (req, res) => {
    const { token } = req.params;
    const body = req.body as CreateMomoPaymentRequestInput;

    const document = await prisma.document.findFirst({
      where: { publicToken: token, status: "FINALIZED", type: "INVOICE" },
    });
    if (!document) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const business = await prisma.business.findUnique({ where: { id: document.businessId } });
    if (!business || !business.momoEnabled) {
      res.status(400).json({ error: "momo_not_enabled" });
      return;
    }

    const existing = await prisma.momoPaymentRequest.findFirst({
      where: { documentId: document.id, status: "PENDING", createdAt: { gt: new Date(Date.now() - MOMO_EXPIRY_MS) } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      res.status(201).json({ requestId: existing.id });
      return;
    }

    const balance = await getInvoiceOutstandingBalance(document.id);
    if (!balance || balance.amountOwed <= 0) {
      res.status(400).json({ error: "nothing_owed" });
      return;
    }

    const credentials = buildMomoCredentials(business);
    if (!credentials) {
      res.status(400).json({ error: "momo_not_configured" });
      return;
    }

    const referenceId = randomUUID();
    const momoRequest = await prisma.momoPaymentRequest.create({
      data: {
        businessId: business.id,
        documentId: document.id,
        referenceId,
        phoneNumber: body.phoneNumber,
        amount: balance.amountOwed,
        status: "PENDING",
      },
    });

    try {
      const token = await getAccessToken(credentials);
      // MTN's sandbox only accepts EUR regardless of target market; production uses the
      // business's real local currency. See the comment on requestToPay for how this was confirmed.
      const currency = business.momoEnvironment === "sandbox" ? "EUR" : "RWF";
      await requestToPay(credentials, token, {
        referenceId,
        amount: balance.amountOwed,
        currency,
        phoneNumber: body.phoneNumber,
        externalId: momoRequest.id,
        payerMessage: `Payment for ${document.number ?? "your invoice"}`,
        payeeNote: `Invoice ${document.number ?? momoRequest.id}`,
      });
    } catch (err) {
      await prisma.momoPaymentRequest.update({
        where: { id: momoRequest.id },
        data: { status: "FAILED", failureReason: err instanceof Error ? err.message : "Unknown error" },
      });
      res.status(502).json({ error: "momo_request_failed" });
      return;
    }

    res.status(201).json({ requestId: momoRequest.id });
  },
);

publicDocumentsRouter.get("/:token/momo/request/:requestId", momoPollRateLimit, async (req, res) => {
  const { token, requestId } = req.params;

  const document = await prisma.document.findFirst({ where: { publicToken: token } });
  if (!document) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const momoRequest = await prisma.momoPaymentRequest.findFirst({ where: { id: requestId, documentId: document.id } });
  if (!momoRequest) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  if (momoRequest.status !== "PENDING") {
    res.json({ status: momoRequest.status, failureReason: momoRequest.failureReason });
    return;
  }

  if (Date.now() - momoRequest.createdAt.getTime() > MOMO_EXPIRY_MS) {
    await prisma.momoPaymentRequest.update({ where: { id: momoRequest.id }, data: { status: "EXPIRED" } });
    res.json({ status: "EXPIRED" });
    return;
  }

  const business = await prisma.business.findUnique({ where: { id: momoRequest.businessId } });
  const credentials = business ? buildMomoCredentials(business) : null;
  if (!business || !credentials) {
    res.json({ status: "PENDING" });
    return;
  }

  let mtnStatus: { status: "PENDING" | "SUCCESSFUL" | "FAILED"; reason?: string };
  try {
    const token = await getAccessToken(credentials);
    mtnStatus = await getRequestToPayStatus(credentials, token, momoRequest.referenceId);
  } catch {
    res.json({ status: "PENDING" });
    return;
  }

  if (mtnStatus.status === "PENDING") {
    res.json({ status: "PENDING" });
    return;
  }

  if (mtnStatus.status === "FAILED") {
    await prisma.momoPaymentRequest.update({
      where: { id: momoRequest.id },
      data: { status: "FAILED", failureReason: mtnStatus.reason ?? null },
    });
    res.json({ status: "FAILED", failureReason: mtnStatus.reason ?? null });
    return;
  }

  const balance = await getInvoiceOutstandingBalance(document.id);
  if (!balance || balance.amountOwed < momoRequest.amount) {
    await prisma.momoPaymentRequest.update({
      where: { id: momoRequest.id },
      data: { status: "FAILED", failureReason: "already_paid" },
    });
    res.json({ status: "FAILED", failureReason: "already_paid" });
    return;
  }

  await recordInvoicePayment({
    businessId: momoRequest.businessId,
    documentId: momoRequest.documentId,
    amount: momoRequest.amount,
    method: "MOBILE_MONEY",
    paidOn: new Date(),
    createdByUserId: business.ownerId,
    referenceNumber: momoRequest.referenceId,
    momoPaymentRequestId: momoRequest.id,
  });
  await prisma.momoPaymentRequest.update({ where: { id: momoRequest.id }, data: { status: "SUCCESSFUL" } });

  res.json({ status: "SUCCESSFUL" });
});
