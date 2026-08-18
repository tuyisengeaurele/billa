import { DOCUMENT_TYPES, type DocumentType } from "@billa/shared";

export const DEFAULT_PREFIXES: Record<DocumentType, string> = {
  INVOICE: "INV-",
  PROFORMA: "PRO-",
  DELIVERY_NOTE: "DN-",
  QUOTE: "QTE-",
  RECEIPT: "RCT-",
};

export interface SequenceView {
  type: DocumentType;
  prefix: string;
  nextNumber: number;
}

export function mergeSequences(
  saved: { type: string; prefix: string; nextNumber: number }[],
): SequenceView[] {
  const savedByType = new Map(saved.map((s) => [s.type, s]));
  return DOCUMENT_TYPES.map((type) => {
    const existing = savedByType.get(type);
    return existing
      ? { type, prefix: existing.prefix, nextNumber: existing.nextNumber }
      : { type, prefix: DEFAULT_PREFIXES[type], nextNumber: 1 };
  });
}
