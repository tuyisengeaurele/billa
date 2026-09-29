import { z } from "zod";
import { customerSchema, type CustomerInput } from "./customer-schemas.js";
import { itemSchema } from "./item-schemas.js";

export const IMPORT_MAX_ROWS = 500;

export const CUSTOMER_IMPORT_FIELDS = ["name", "phone", "email", "tin", "address"] as const;
export const ITEM_IMPORT_FIELDS = ["description", "unitPrice", "unit", "taxRate", "category"] as const;

export const importRowsRequestSchema = z.object({
  rows: z.array(z.record(z.string())).min(1, "Choose a file with at least one row").max(IMPORT_MAX_ROWS),
});
export type ImportRowsRequest = z.infer<typeof importRowsRequestSchema>;

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["name", "customer", "customername", "fullname", "clientname", "client", "company", "companyname"],
  phone: ["phone", "phonenumber", "mobile", "mobilenumber", "tel", "telephone", "contact", "msisdn"],
  email: ["email", "emailaddress", "mail"],
  tin: ["tin", "tinnumber", "taxid", "taxnumber", "vatnumber"],
  address: ["address", "location", "city", "street"],
  description: ["description", "item", "itemname", "product", "productname", "service", "name"],
  unitPrice: ["unitprice", "price", "rate", "cost", "sellingprice", "amount"],
  unit: ["unit", "uom", "unitofmeasure", "measure"],
  taxRate: ["taxrate", "tax", "vat", "vatrate"],
  category: ["category", "group", "type"],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** For each field, the index of the CSV column whose header looks like it, or null. A column is used for at most one field. */
export function guessColumnMapping<F extends string>(
  headers: string[],
  fields: readonly F[],
): Record<F, number | null> {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping = {} as Record<F, number | null>;
  for (const field of fields) {
    const aliases = HEADER_ALIASES[field] ?? [field.toLowerCase()];
    let found: number | null = null;
    for (const alias of aliases) {
      const index = normalized.findIndex((header, i) => header === alias && !used.has(i));
      if (index !== -1) {
        found = index;
        break;
      }
    }
    if (found !== null) used.add(found);
    mapping[field] = found;
  }
  return mapping;
}

export type ImportRowResult<T> = { ok: true; value: T } | { ok: false; error: string };

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function parseCustomerImportRow(raw: Record<string, string>): ImportRowResult<CustomerInput> {
  const parsed = customerSchema.safeParse({
    name: raw.name?.trim() ?? "",
    phone: blankToUndefined(raw.phone),
    email: blankToUndefined(raw.email),
    tin: blankToUndefined(raw.tin),
    address: blankToUndefined(raw.address),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  return { ok: true, value: parsed.data };
}

export function parseItemImportRow(raw: Record<string, string>): ImportRowResult<z.infer<typeof itemSchema>> {
  const priceText = (raw.unitPrice ?? "").replace(/[^\d.]/g, "");
  const taxText = blankToUndefined((raw.taxRate ?? "").replace(/[^\d.]/g, ""));
  const parsed = itemSchema.safeParse({
    description: raw.description?.trim() ?? "",
    unitPrice: priceText ? Math.round(Number(priceText)) : Number.NaN,
    unit: blankToUndefined(raw.unit) ?? "each",
    taxRate: taxText === undefined ? undefined : Number(taxText),
    category: blankToUndefined(raw.category) ?? null,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  return { ok: true, value: parsed.data };
}
