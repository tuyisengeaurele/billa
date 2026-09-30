import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma.js";
import { resetDb } from "../test/db.js";
import { fetchBnrRate, getStoredRates, refreshExchangeRates } from "./exchange-rates.js";

beforeEach(resetDb);

afterEach(() => {
  vi.restoreAllMocks();
});

function mockBank(rates: Record<string, number | "fail">, date = "2026-09-29") {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const currency = /\/rate\/([A-Z]{3})\/RWF/.exec(url)?.[1] ?? "";
    const rate = rates[currency];
    if (rate === undefined || rate === "fail") return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({ date, base: currency, quote: "RWF", rate }), { status: 200 });
  });
}

const ALL = { USD: 1473.79, EUR: 1690.5, GBP: 1980.2, KES: 11.4, UGX: 0.4, TZS: 0.56 };

describe("fetchBnrRate", () => {
  it("reads the rate and the day it was published for", async () => {
    mockBank(ALL);

    expect(await fetchBnrRate("USD")).toEqual({ rate: 1473.79, date: "2026-09-29" });
  });

  it("asks for the bank's own rates", async () => {
    const spy = mockBank(ALL);

    await fetchBnrRate("USD");

    expect(String(spy.mock.calls[0]![0])).toBe("https://api.frankfurter.dev/v2/rate/USD/RWF?providers=BNRRW");
  });

  it("gives nothing when the bank does not answer, or answers nonsense", async () => {
    mockBank({ USD: "fail" });
    expect(await fetchBnrRate("USD")).toBeNull();

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ date: "2026-09-29", quote: "RWF", rate: -3 }), { status: 200 }),
    );
    expect(await fetchBnrRate("USD")).toBeNull();

    vi.spyOn(global, "fetch").mockRejectedValue(new Error("offline"));
    expect(await fetchBnrRate("USD")).toBeNull();
  });
});

describe("refreshExchangeRates", () => {
  it("stores a rate for every foreign currency", async () => {
    mockBank(ALL);

    const updated = await refreshExchangeRates();

    expect(updated).toBe(6);
    const stored = await getStoredRates();
    expect(stored.USD).toMatchObject({ rate: 1473.79, source: "BNR" });
    expect(stored.USD!.rateDate.toISOString().slice(0, 10)).toBe("2026-09-29");
    expect(stored.RWF).toBeUndefined();
  });

  it("does not ask again within twelve hours", async () => {
    const spy = mockBank(ALL);
    await refreshExchangeRates(new Date("2026-09-30T08:00:00Z"));
    spy.mockClear();

    const second = await refreshExchangeRates(new Date("2026-09-30T14:00:00Z"));

    expect(second).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("refreshes a day later and keeps the old rate for a currency the bank skips", async () => {
    mockBank(ALL, "2026-09-29");
    await refreshExchangeRates(new Date("2026-09-30T08:00:00Z"));

    mockBank({ ...ALL, USD: 1480, EUR: "fail" }, "2026-10-01");
    const updated = await refreshExchangeRates(new Date("2026-10-01T08:00:00Z"));

    expect(updated).toBe(5);
    const stored = await getStoredRates();
    expect(stored.USD!.rate).toBe(1480);
    expect(stored.EUR!.rate).toBe(1690.5);
  });

  it("keeps whatever is stored when the bank is unreachable", async () => {
    mockBank(ALL);
    await refreshExchangeRates(new Date("2026-09-30T08:00:00Z"));
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("offline"));

    const updated = await refreshExchangeRates(new Date("2026-10-02T08:00:00Z"));

    expect(updated).toBe(0);
    expect(await prisma.exchangeRate.count()).toBe(6);
  });
});
