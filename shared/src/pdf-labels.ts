import type { DocumentLanguage, DocumentType } from "./document-types.js";

export interface PdfLabels {
  typeLabels: Record<DocumentType, string>;
  billTo: string;
  deliverTo: string;
  dueDate: string;
  validUntil: string;
  draft: string;
  finalized: string;
  reference: string;
  description: string;
  qty: string;
  unitPrice: string;
  tax: string;
  amount: string;
  total: string;
  subtotal: string;
  amountInWords: string;
  notes: string;
  paymentInstructions: string;
  accountName: string;
  accountNo: string;
  bank: string;
  authorizedSignature: string;
  dispatchedBy: string;
  receivedBy: string;
  tin: string;
  lineItems: string;
  fromSeller: string;
  company: string;
  tel: string;
  email: string;
  currency: string;
  currencyValue: string;
  contact: string;
  location: string;
  name: string;
  issued: string;
  documentIssuedBy: string;
  allAmountsIn: string;
}

const EN: PdfLabels = {
  typeLabels: {
    INVOICE: "Invoice",
    PROFORMA: "Proforma Invoice",
    DELIVERY_NOTE: "Delivery Note",
    QUOTE: "Quote",
    RECEIPT: "Receipt",
    CREDIT_NOTE: "Credit Note",
  },
  billTo: "Bill to",
  deliverTo: "Deliver to",
  dueDate: "Due date",
  validUntil: "Valid until",
  draft: "Draft",
  finalized: "Finalized",
  reference: "Reference",
  description: "Description",
  qty: "Qty",
  unitPrice: "Unit price",
  tax: "Tax",
  amount: "Amount",
  total: "Total",
  subtotal: "Subtotal",
  amountInWords: "Amount in words",
  notes: "Notes",
  paymentInstructions: "Payment instructions",
  accountName: "Account name",
  accountNo: "Account no",
  bank: "Bank",
  authorizedSignature: "Authorized signature",
  dispatchedBy: "Dispatched by",
  receivedBy: "Received by",
  tin: "TIN",
  lineItems: "Line Items",
  fromSeller: "From (Seller)",
  company: "Company",
  tel: "Tel",
  email: "Email",
  currency: "Currency",
  currencyValue: "RWF (Rwandan Franc)",
  contact: "Contact",
  location: "Location",
  name: "Name",
  issued: "Issued",
  documentIssuedBy: "This is a document issued by",
  allAmountsIn: "All amounts in Rwandan Francs (RWF)",
};

const FR: PdfLabels = {
  typeLabels: {
    INVOICE: "Facture",
    PROFORMA: "Facture Proforma",
    DELIVERY_NOTE: "Bon de Livraison",
    QUOTE: "Devis",
    RECEIPT: "Reçu",
    CREDIT_NOTE: "Note de Crédit",
  },
  billTo: "Facturé à",
  deliverTo: "Livré à",
  dueDate: "Échéance",
  validUntil: "Valable jusqu'au",
  draft: "Brouillon",
  finalized: "Finalisé",
  reference: "Référence",
  description: "Description",
  qty: "Qté",
  unitPrice: "Prix unitaire",
  tax: "Taxe",
  amount: "Montant",
  total: "Total",
  subtotal: "Sous-total",
  amountInWords: "Montant en lettres",
  notes: "Remarques",
  paymentInstructions: "Instructions de paiement",
  accountName: "Nom du compte",
  accountNo: "N° de compte",
  bank: "Banque",
  authorizedSignature: "Signature autorisée",
  dispatchedBy: "Expédié par",
  receivedBy: "Reçu par",
  tin: "NIF",
  lineItems: "Articles",
  fromSeller: "De (Vendeur)",
  company: "Société",
  tel: "Tél",
  email: "Email",
  currency: "Devise",
  currencyValue: "FRW (Franc Rwandais)",
  contact: "Contact",
  location: "Localisation",
  name: "Nom",
  issued: "Émis le",
  documentIssuedBy: "Ceci est un document émis par",
  allAmountsIn: "Tous les montants sont en Francs Rwandais (FRW)",
};

const LABELS_BY_LANGUAGE: Record<DocumentLanguage, PdfLabels> = { EN, FR };

export function getPdfLabels(language: DocumentLanguage): PdfLabels {
  return LABELS_BY_LANGUAGE[language];
}
