import type { Document, RecurrenceInterval } from "@prisma/client";
import { prisma } from "./prisma.js";
import { calculateDocumentTotals } from "./document-totals.js";

export function addInterval(date: Date, interval: RecurrenceInterval): Date {
  const next = new Date(date);
  switch (interval) {
    case "WEEKLY":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "MONTHLY":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case "QUARTERLY":
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    case "ANNUALLY":
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
  }
  return next;
}

export async function generateDueRecurringDocuments(businessId: string): Promise<Document[]> {
  const now = new Date();
  const due = await prisma.document.findMany({
    where: { businessId, nextRecurrenceAt: { lte: now } },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });

  const generated: Document[] = [];

  for (const source of due) {
    if (source.recurrenceEndDate && source.nextRecurrenceAt! > source.recurrenceEndDate) {
      await prisma.document.update({
        where: { id: source.id },
        data: { recurrenceInterval: null, recurrenceEndDate: null, nextRecurrenceAt: null },
      });
      continue;
    }

    const totals = calculateDocumentTotals(
      source.lines.map((line) => ({
        quantity: Number(line.quantity),
        unitPrice: line.unitPrice,
        taxRate: Number(line.taxRate),
        discountType: line.discountType,
        discountValue: line.discountValue ? Number(line.discountValue) : null,
      })),
    );

    // Each repeat gets the same window to pay as the original had, counted from its own issue date.
    const issueDate = source.nextRecurrenceAt!;
    const dueDate = source.dueDate
      ? new Date(issueDate.getTime() + (source.dueDate.getTime() - source.issueDate.getTime()))
      : null;

    const newDocument = await prisma.document.create({
      data: {
        businessId: source.businessId,
        type: source.type,
        status: "DRAFT",
        template: source.template,
        customerId: source.customerId,
        issueDate,
        dueDate,
        language: source.language,
        customerReference: source.customerReference,
        notes: source.notes,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        currency: source.currency,
        exchangeRate: source.exchangeRate,
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
    });
    generated.push(newDocument);

    await prisma.document.update({
      where: { id: source.id },
      data: { nextRecurrenceAt: addInterval(source.nextRecurrenceAt!, source.recurrenceInterval!) },
    });
  }

  return generated;
}
