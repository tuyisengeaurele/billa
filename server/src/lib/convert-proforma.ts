import type { Document, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { calculateDocumentTotals } from "./document-totals.js";

const CONVERTIBLE_TYPES = ["PROFORMA", "QUOTE"];

export type ConvertProformaResult =
  | { ok: true; invoice: Document }
  | { ok: false; status: number; error: string };

export async function convertProformaToInvoice(
  where: Prisma.DocumentWhereInput & { id: string },
): Promise<ConvertProformaResult> {
  const proforma = await prisma.document.findFirst({
    where,
    include: { lines: true, convertedTo: { select: { id: true } } },
  });
  if (!proforma) {
    return { ok: false, status: 404, error: "not_found" };
  }
  if (!CONVERTIBLE_TYPES.includes(proforma.type)) {
    return { ok: false, status: 400, error: "not_convertible" };
  }
  if (proforma.status !== "FINALIZED") {
    return { ok: false, status: 409, error: "not_finalized" };
  }
  if (proforma.declinedAt) {
    return { ok: false, status: 409, error: "already_declined" };
  }
  if (proforma.convertedTo) {
    return { ok: false, status: 409, error: "already_converted" };
  }

  const business = await prisma.business.findUnique({ where: { id: proforma.businessId } });
  const totals = calculateDocumentTotals(
    proforma.lines.map((line) => ({
      quantity: Number(line.quantity),
      unitPrice: line.unitPrice,
      taxRate: Number(line.taxRate),
      discountType: line.discountType,
      discountValue: line.discountValue ? Number(line.discountValue) : null,
    })),
  );

  const invoice = await prisma.document.create({
    data: {
      businessId: proforma.businessId,
      type: "INVOICE",
      status: "DRAFT",
      template: business!.defaultTemplate,
      customerId: proforma.customerId,
      issueDate: new Date(new Date().toISOString().slice(0, 10)),
      notes: proforma.notes,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      convertedFromId: proforma.id,
      lines: {
        create: proforma.lines.map((line, index) => ({
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
  });

  return { ok: true, invoice };
}

export type DeclineDocumentResult = { ok: true } | { ok: false; status: number; error: string };

export async function declineDocument(
  where: Prisma.DocumentWhereInput & { id: string },
): Promise<DeclineDocumentResult> {
  const document = await prisma.document.findFirst({
    where,
    include: { convertedTo: { select: { id: true } } },
  });
  if (!document) {
    return { ok: false, status: 404, error: "not_found" };
  }
  if (!CONVERTIBLE_TYPES.includes(document.type)) {
    return { ok: false, status: 400, error: "not_declinable" };
  }
  if (document.status !== "FINALIZED") {
    return { ok: false, status: 409, error: "not_finalized" };
  }
  if (document.convertedTo) {
    return { ok: false, status: 409, error: "already_converted" };
  }
  if (document.declinedAt) {
    return { ok: false, status: 409, error: "already_declined" };
  }

  await prisma.document.update({ where: { id: document.id }, data: { declinedAt: new Date() } });
  return { ok: true };
}
