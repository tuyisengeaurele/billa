import { randomUUID } from "node:crypto";
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
    // either write lands, assigning the same number twice. A single INSERT ... ON CONFLICT
    // statement (with the reset-or-increment decision made inside its CASE expression) is one
    // atomic SQL statement that Postgres serializes per row, so concurrent finalizes can never
    // collide - the same guarantee the plain `{ increment: 1 }` upsert gave before yearly reset
    // needed a conditional update instead of an unconditional one.
    const currentYear = new Date().getFullYear();
    const rows = await tx.$queryRaw<{ prefix: string; nextNumber: number; resetYearly: boolean }[]>`
      INSERT INTO "DocumentSequence" (id, "businessId", type, prefix, "nextNumber", "resetYearly", "lastResetYear")
      VALUES (${randomUUID()}, ${businessId}, ${document.type}::"DocumentType", ${DEFAULT_PREFIXES[document.type]}, 2, false, ${currentYear})
      ON CONFLICT ("businessId", type) DO UPDATE SET
        "nextNumber" = CASE
          WHEN "DocumentSequence"."resetYearly" AND "DocumentSequence"."lastResetYear" IS DISTINCT FROM ${currentYear}
          THEN 2
          ELSE "DocumentSequence"."nextNumber" + 1
        END,
        "lastResetYear" = ${currentYear}
      RETURNING prefix, "nextNumber", "resetYearly"
    `;
    const sequence = rows[0]!;
    const assignedNumber = sequence.nextNumber - 1;
    const paddedNumber = String(assignedNumber).padStart(4, "0");
    const number = sequence.resetYearly
      ? `${sequence.prefix}${currentYear}-${paddedNumber}`
      : `${sequence.prefix}${paddedNumber}`;

    return tx.document.update({
      where: { id },
      data: { number, status: "FINALIZED" },
    });
  });

  return { ok: true, document: finalized };
}
