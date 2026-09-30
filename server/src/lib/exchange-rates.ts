import { BASE_CURRENCY, CURRENCIES, isCurrency, type Currency } from "@billa/shared";
import { prisma } from "./prisma.js";

// The National Bank of Rwanda's daily reference rates, republished by Frankfurter (free, no key).
// The bank's own API needs a business application, so this is the source until that is approved.
const RATE_URL = "https://api.frankfurter.dev/v2/rate";
const SOURCE = "BNR";
const FETCH_TIMEOUT_MS = 10_000;
// Rates are published once a day, so there is no point asking again within half a day.
const FRESH_FOR_MS = 12 * 60 * 60 * 1000;

const FOREIGN_CURRENCIES = CURRENCIES.filter((currency) => currency !== BASE_CURRENCY);

export interface FetchedRate {
  rate: number;
  // The day the bank published the rate for, "2026-09-29".
  date: string;
}

/** RWF for one whole unit of the currency, as the bank published it. Null when it cannot be had. */
export async function fetchBnrRate(currency: Currency): Promise<FetchedRate | null> {
  try {
    const response = await fetch(`${RATE_URL}/${currency}/${BASE_CURRENCY}?providers=BNRRW`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { rate?: unknown; date?: unknown; quote?: unknown };
    if (body.quote !== BASE_CURRENCY) return null;
    const rate = Number(body.rate);
    if (!Number.isFinite(rate) || rate <= 0 || typeof body.date !== "string" || Number.isNaN(Date.parse(body.date))) {
      return null;
    }
    return { rate, date: body.date };
  } catch {
    return null;
  }
}

/**
 * Stores today's reference rate for each foreign currency, unless it was fetched in the last twelve
 * hours. A currency the bank does not answer for keeps its last stored rate. Returns how many were updated.
 */
export async function refreshExchangeRates(now = new Date()): Promise<number> {
  const stored = await prisma.exchangeRate.findMany();
  const fetchedAt = new Map(stored.map((row) => [row.currency, row.fetchedAt.getTime()]));
  let updated = 0;

  const due = FOREIGN_CURRENCIES.filter((currency) => {
    const last = fetchedAt.get(currency);
    return last === undefined || now.getTime() - last >= FRESH_FOR_MS;
  });
  // Asked together, so a slow answer for one currency does not hold up the rest.
  const answers = await Promise.all(due.map(async (currency) => ({ currency, fetched: await fetchBnrRate(currency) })));

  for (const { currency, fetched } of answers) {
    if (!fetched) continue;
    await prisma.exchangeRate.upsert({
      where: { currency },
      create: { currency, rate: fetched.rate, rateDate: new Date(fetched.date), source: SOURCE, fetchedAt: now },
      update: { rate: fetched.rate, rateDate: new Date(fetched.date), source: SOURCE, fetchedAt: now },
    });
    updated += 1;
  }
  return updated;
}

export interface StoredRate {
  rate: number;
  rateDate: Date;
  source: string;
}

export async function getStoredRates(): Promise<Partial<Record<Currency, StoredRate>>> {
  const rows = await prisma.exchangeRate.findMany();
  const rates: Partial<Record<Currency, StoredRate>> = {};
  for (const row of rows) {
    if (isCurrency(row.currency)) rates[row.currency] = { rate: row.rate, rateDate: row.rateDate, source: row.source };
  }
  return rates;
}

/**
 * For the form to call: with nothing stored yet the first request waits for the bank, so a new install
 * has a rate straight away; otherwise a stale rate is refreshed in the background and the answer is not delayed.
 * Does nothing under test, so no test run reaches the network.
 */
export async function ensureRates(): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  const count = await prisma.exchangeRate.count();
  if (count === 0) {
    await refreshExchangeRates().catch(() => 0);
    return;
  }
  void refreshExchangeRates().catch(() => 0);
}
