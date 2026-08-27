import type { Document } from "@prisma/client";
import { prisma } from "./prisma.js";
import { DEFAULT_PREFIXES } from "./document-sequences.js";

export type FinalizeDocumentResult =
  | { ok: true; document: Document }
  | { ok: false; status: number; error: string };

export async function finalizeDocumentById(businessId: string, id: string): Promise<FinalizeDocumentResult> {
  const document = await prisma.document.findFirst({ where: { id, businessId }, include: { lines: true } });
  if (!document) {
    return { ok: false, status: 404, error: "not_found" };
  }
  if (document.status === "FINALIZED") {
    return { ok: false, status: 409, error: "already_finalized" };
  }
  if (document.lines.length === 0) {
    return { ok: false, status: 400, error: "no_lines" };
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
    });
  });

  return { ok: true, document: finalized };
}
