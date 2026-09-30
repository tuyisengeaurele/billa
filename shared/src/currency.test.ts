import { describe, expect, it } from "vitest";
import {
  amountInWordsEn,
  formatMoney,
  minorToMajorText,
  parseMajorAmount,
  rateProblem,
  toRwf,
} from "./currency.js";

describe("currency", () => {
  it("formats RWF as before and other currencies with their decimals", () => {
    expect(formatMoney(10000)).toBe("10,000 RWF");
    expect(formatMoney(125050, "USD")).toBe("1,250.50 USD");
    expect(formatMoney(100, "EUR")).toBe("1.00 EUR");
    expect(formatMoney(5000, "UGX")).toBe("5,000 UGX");
  });

  it("turns typed prices into the smallest unit and back", () => {
    expect(parseMajorAmount("12.5", "USD")).toBe(1250);
    expect(parseMajorAmount("1,250.75", "USD")).toBe(125075);
    expect(parseMajorAmount("12", "RWF")).toBe(12);
    expect(parseMajorAmount("abc", "USD")).toBeNull();
    expect(parseMajorAmount("", "USD")).toBeNull();
    expect(minorToMajorText(1250, "USD")).toBe("12.5");
    expect(minorToMajorText(1200, "USD")).toBe("12");
    expect(minorToMajorText(0, "USD")).toBe("");
  });

  it("converts to RWF at the saved rate", () => {
    expect(toRwf(1000, "RWF", null)).toBe(1000);
    expect(toRwf(12500, "USD", 1450)).toBe(181250);
    expect(toRwf(1, "USD", 1450)).toBe(15);
    expect(toRwf(12500, "USD", null)).toBe(0);
  });

  it("asks for a rate on every currency but RWF", () => {
    expect(rateProblem("RWF", null)).toBeNull();
    expect(rateProblem("USD", null)).toBe("Enter the exchange rate for USD.");
    expect(rateProblem("USD", 0)).toBe("Enter the exchange rate for USD.");
    expect(rateProblem("USD", 1450)).toBeNull();
  });

  it("writes amounts in words with the minor unit", () => {
    expect(amountInWordsEn(1250, "USD")).toBe("Twelve US Dollars and Fifty Cents Only");
    expect(amountInWordsEn(100, "USD")).toBe("One US Dollar Only");
    expect(amountInWordsEn(101, "EUR")).toBe("One Euro and One Cent Only");
  });
});

describe("currency words in French", () => {
  it("writes the major and minor units", async () => {
    const { amountInWordsFrCurrency } = await import("./currency.js");
    expect(amountInWordsFrCurrency(1250, "USD")).toBe("Douze Dollars Américains et Cinquante Cents Seulement");
    expect(amountInWordsFrCurrency(100, "EUR")).toBe("Un Euro Seulement");
  });
});
