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
    // Increment atomically in the database rather than reading nextNumber, computing the
    // new value in application code, and writing it back - that read-then-write pattern lets
    // two documents finalized at the same instant both read the same "current" number before
    // either write lands, assigning the same number twice. A single `{ increment: 1 }` update
    // (or the create branch's fixed starting value) is one atomic SQL statement that Postgres
    // serializes per row, so concurrent finalizes can never collide.
    const sequence = await tx.documentSequence.upsert({
      where: { businessId_type: { businessId, type: document.type } },
      create: { businessId, type: document.type, prefix: DEFAULT_PREFIXES[document.type], nextNumber: 2 },
      update: { nextNumber: { increment: 1 } },
    });
    const assignedNumber = sequence.nextNumber - 1;

    return tx.document.update({
      where: { id },
      data: {
        number: `${sequence.prefix}${String(assignedNumber).padStart(4, "0")}`,
        status: "FINALIZED",
      },
    });
  });

  return { ok: true, document: finalized };
}
