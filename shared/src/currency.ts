import { numberToWords } from "./money.js";

export const CURRENCIES = ["RWF", "USD", "EUR", "GBP", "KES", "UGX", "TZS"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const BASE_CURRENCY: Currency = "RWF";

interface CurrencyInfo {
  // Digits after the decimal point. Amounts are stored as whole numbers of the smallest unit.
  decimals: number;
  name: string;
  words: { major: [string, string]; minor: [string, string] };
}

const CURRENCY_INFO: Record<Currency, CurrencyInfo> = {
  RWF: { decimals: 0, name: "Rwandan franc", words: { major: ["Rwandan Franc", "Rwandan Francs"], minor: ["", ""] } },
  USD: { decimals: 2, name: "US dollar", words: { major: ["US Dollar", "US Dollars"], minor: ["Cent", "Cents"] } },
  EUR: { decimals: 2, name: "Euro", words: { major: ["Euro", "Euros"], minor: ["Cent", "Cents"] } },
  GBP: { decimals: 2, name: "British pound", words: { major: ["Pound", "Pounds"], minor: ["Penny", "Pence"] } },
  KES: { decimals: 2, name: "Kenyan shilling", words: { major: ["Kenyan Shilling", "Kenyan Shillings"], minor: ["Cent", "Cents"] } },
  UGX: { decimals: 0, name: "Ugandan shilling", words: { major: ["Ugandan Shilling", "Ugandan Shillings"], minor: ["", ""] } },
  TZS: { decimals: 2, name: "Tanzanian shilling", words: { major: ["Tanzanian Shilling", "Tanzanian Shillings"], minor: ["Cent", "Cents"] } },
};

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

export function currencyName(currency: Currency): string {
  return CURRENCY_INFO[currency].name;
}

export function currencyDecimals(currency: Currency): number {
  return CURRENCY_INFO[currency].decimals;
}

/** How many of the smallest unit make one whole unit: 1 for RWF, 100 for USD. */
export function minorPerMajor(currency: Currency): number {
  return 10 ** CURRENCY_INFO[currency].decimals;
}

/** "12.50" typed in a price box becomes 1250 for USD and 12 for RWF. Returns null for text that is not an amount. */
export function parseMajorAmount(text: string, currency: Currency): number | null {
  const cleaned = text.replace(/[\s,]/g, "");
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
  return Math.round(Number(cleaned) * minorPerMajor(currency));
}

/** 1250 for USD becomes "12.5" for a price box; whole units for RWF. */
export function minorToMajorText(minor: number, currency: Currency): string {
  if (!minor) return "";
  const decimals = currencyDecimals(currency);
  return String(Number((minor / minorPerMajor(currency)).toFixed(decimals)));
}

/** "1,250.50 USD". RWF has no decimals and reads as before: "10,000 RWF". */
export function formatMoney(minor: number, currency: Currency = BASE_CURRENCY): string {
  const decimals = currencyDecimals(currency);
  const value = minor / minorPerMajor(currency);
  return `${value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${currency}`;
}

/** What an amount in another currency is worth in RWF, at the rate saved on the document (RWF for one whole unit). */
export function toRwf(minor: number, currency: Currency, rate: number | null | undefined): number {
  if (currency === BASE_CURRENCY) return minor;
  if (!rate || rate <= 0) return 0;
  return Math.round((minor / minorPerMajor(currency)) * rate);
}

/** A rate has to be a positive number; RWF documents have none. */
export function rateProblem(currency: Currency, rate: number | null | undefined): string | null {
  if (currency === BASE_CURRENCY) return null;
  if (rate === null || rate === undefined || !Number.isFinite(rate) || rate <= 0) {
    return `Enter the exchange rate for ${currency}.`;
  }
  if (rate > 1_000_000) return "That exchange rate looks too high.";
  return null;
}

/** "Twelve US Dollars and Fifty Cents Only". RWF keeps its own wording in amountInWordsRwf. */
export function amountInWordsEn(minor: number, currency: Currency): string {
  const info = CURRENCY_INFO[currency];
  const per = minorPerMajor(currency);
  const major = Math.floor(minor / per);
  const cents = minor % per;
  const majorName = major === 1 ? info.words.major[0] : info.words.major[1];
  const parts = [`${numberToWords(major)} ${majorName}`];
  if (cents > 0) {
    parts.push(`${numberToWords(cents)} ${cents === 1 ? info.words.minor[0] : info.words.minor[1]}`);
  }
  return `${parts.join(" and ")} Only`;
}
