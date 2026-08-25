import { describe, expect, it } from "vitest";
import { amountInWordsRwf, formatRwf } from "./money.js";

describe("formatRwf", () => {
  it("formats with thousands separators and an RWF suffix", () => {
    expect(formatRwf(12500)).toBe("12,500 RWF");
  });

  it("formats zero", () => {
    expect(formatRwf(0)).toBe("0 RWF");
  });

  it("formats large numbers", () => {
    expect(formatRwf(1234567)).toBe("1,234,567 RWF");
  });
});

describe("amountInWordsRwf", () => {
  it("spells out zero", () => {
    expect(amountInWordsRwf(0)).toBe("Zero Rwandan Francs Only");
  });

  it("spells out a simple amount", () => {
    expect(amountInWordsRwf(17700)).toBe("Seventeen Thousand Seven Hundred Rwandan Francs Only");
  });

  it("spells out an amount with tens and ones", () => {
    expect(amountInWordsRwf(1234567)).toBe(
      "One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven Rwandan Francs Only",
    );
  });

  it("spells out a round million", () => {
    expect(amountInWordsRwf(1000000)).toBe("One Million Rwandan Francs Only");
  });

  it("spells out teens correctly", () => {
    expect(amountInWordsRwf(15000)).toBe("Fifteen Thousand Rwandan Francs Only");
  });

  it("rounds fractional amounts to the nearest whole franc", () => {
    expect(amountInWordsRwf(1234.6)).toBe("One Thousand Two Hundred Thirty-Five Rwandan Francs Only");
  });
});
