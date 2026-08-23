import type { DocumentType } from "@billa/shared";

interface DocumentTypeColor {
  hex: string;
  chipBg: string;
  chipText: string;
  chipBgSelected: string;
  iconBg: string;
  iconText: string;
  dot: string;
}

export const DOCUMENT_TYPE_COLORS: Record<DocumentType, DocumentTypeColor> = {
  INVOICE: {
    hex: "#2563eb",
    chipBg: "bg-blue-100 dark:bg-blue-500/15",
    chipText: "text-blue-700 dark:text-blue-300",
    chipBgSelected: "bg-blue-600 text-white",
    iconBg: "bg-blue-100 dark:bg-blue-500/15 group-hover:bg-blue-600",
    iconText: "text-blue-700 dark:text-blue-300 group-hover:text-white",
    dot: "bg-blue-500",
  },
  PROFORMA: {
    hex: "#7c3aed",
    chipBg: "bg-violet-100 dark:bg-violet-500/15",
    chipText: "text-violet-700 dark:text-violet-300",
    chipBgSelected: "bg-violet-600 text-white",
    iconBg: "bg-violet-100 dark:bg-violet-500/15 group-hover:bg-violet-600",
    iconText: "text-violet-700 dark:text-violet-300 group-hover:text-white",
    dot: "bg-violet-500",
  },
  DELIVERY_NOTE: {
    hex: "#0d9488",
    chipBg: "bg-teal-100 dark:bg-teal-500/15",
    chipText: "text-teal-700 dark:text-teal-300",
    chipBgSelected: "bg-teal-600 text-white",
    iconBg: "bg-teal-100 dark:bg-teal-500/15 group-hover:bg-teal-600",
    iconText: "text-teal-700 dark:text-teal-300 group-hover:text-white",
    dot: "bg-teal-500",
  },
  QUOTE: {
    hex: "#d97706",
    chipBg: "bg-amber-100 dark:bg-amber-500/15",
    chipText: "text-amber-700 dark:text-amber-300",
    chipBgSelected: "bg-amber-600 text-white",
    iconBg: "bg-amber-100 dark:bg-amber-500/15 group-hover:bg-amber-600",
    iconText: "text-amber-700 dark:text-amber-300 group-hover:text-white",
    dot: "bg-amber-500",
  },
  RECEIPT: {
    hex: "#059669",
    chipBg: "bg-emerald-100 dark:bg-emerald-500/15",
    chipText: "text-emerald-700 dark:text-emerald-300",
    chipBgSelected: "bg-emerald-600 text-white",
    iconBg: "bg-emerald-100 dark:bg-emerald-500/15 group-hover:bg-emerald-600",
    iconText: "text-emerald-700 dark:text-emerald-300 group-hover:text-white",
    dot: "bg-emerald-500",
  },
};
