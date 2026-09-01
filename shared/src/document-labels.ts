import type { DocumentType } from "./document-types.js";
import { getPdfLabels, type PdfLabels } from "./pdf-labels.js";

export function getDueDateLabel(type: DocumentType, labels: PdfLabels = getPdfLabels("EN")): string | null {
  switch (type) {
    case "INVOICE":
      return labels.dueDate;
    case "PROFORMA":
    case "QUOTE":
      return labels.validUntil;
    case "DELIVERY_NOTE":
    case "RECEIPT":
    case "CREDIT_NOTE":
      return null;
  }
}

export function getPartyLabel(type: DocumentType, labels: PdfLabels = getPdfLabels("EN")): string {
  return type === "DELIVERY_NOTE" ? labels.deliverTo : labels.billTo;
}
