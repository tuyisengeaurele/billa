import {
  CUSTOMER_IMPORT_FIELDS,
  ITEM_IMPORT_FIELDS,
  parseCustomerImportRow,
  parseItemImportRow,
  type ImportRowResult,
} from "@billa/shared";

export interface ImportConfig {
  noun: string;
  path: string;
  fields: readonly string[];
  labels: Record<string, string>;
  // Columns the file cannot be imported without.
  required: readonly string[];
  parseRow: (raw: Record<string, string>) => ImportRowResult<unknown>;
  templateFilename: string;
  templateExample: string[];
}

export const CUSTOMER_IMPORT: ImportConfig = {
  noun: "customers",
  path: "/customers/import",
  fields: CUSTOMER_IMPORT_FIELDS,
  labels: { name: "Name", phone: "Phone", email: "Email", tin: "TIN", address: "Address" },
  required: ["name"],
  parseRow: parseCustomerImportRow,
  templateFilename: "customers-template.csv",
  templateExample: ["Acme Ltd", "0788123456", "accounts@acme.rw", "123456789", "KG 7 Ave, Kigali"],
};

export const ITEM_IMPORT: ImportConfig = {
  noun: "items",
  path: "/items/import",
  fields: ITEM_IMPORT_FIELDS,
  labels: { description: "Description", unitPrice: "Unit price", unit: "Unit", taxRate: "Tax rate", category: "Category" },
  required: ["description", "unitPrice"],
  parseRow: parseItemImportRow,
  templateFilename: "items-template.csv",
  templateExample: ["Cement 50kg", "12500", "bag", "18", "Building"],
};
