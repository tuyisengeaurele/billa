import type { DocumentType } from "./document-types.js";

export function getDueDateLabel(type: DocumentType): string | null {
  switch (type) {
    case "INVOICE":
      return "Due date";
    case "PROFORMA":
    case "QUOTE":
      return "Valid until";
    case "DELIVERY_NOTE":
    case "RECEIPT":
      return null;
  }
}

export function getPartyLabel(type: DocumentType): string {
  return type === "DELIVERY_NOTE" ? "Deliver to" : "Bill to";
}
