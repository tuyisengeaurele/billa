import { describe, expect, it } from "vitest";
import { amountInWordsFr, amountInWordsRwf, formatRwf } from "./money.js";

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

describe("amountInWordsFr", () => {
  it("spells out zero", () => {
    expect(amountInWordsFr(0)).toBe("Zéro Francs Rwandais Seulement");
  });

  it("spells out a simple amount", () => {
    expect(amountInWordsFr(17700)).toBe("Dix-sept mille sept cents Francs Rwandais Seulement");
  });

  it("handles the 70-79 irregularity (soixante + dix)", () => {
    expect(amountInWordsFr(70)).toBe("Soixante-dix Francs Rwandais Seulement");
    expect(amountInWordsFr(71)).toBe("Soixante et onze Francs Rwandais Seulement");
    expect(amountInWordsFr(79)).toBe("Soixante-dix-neuf Francs Rwandais Seulement");
  });

  it("handles the 80-89 irregularity (quatre-vingts, no 'et')", () => {
    expect(amountInWordsFr(80)).toBe("Quatre-vingts Francs Rwandais Seulement");
    expect(amountInWordsFr(81)).toBe("Quatre-vingt-un Francs Rwandais Seulement");
  });

  it("handles the 90-99 irregularity (quatre-vingt-dix)", () => {
    expect(amountInWordsFr(90)).toBe("Quatre-vingt-dix Francs Rwandais Seulement");
    expect(amountInWordsFr(91)).toBe("Quatre-vingt-onze Francs Rwandais Seulement");
  });

  it("uses 'et un' for 21, 31, 41, 51, 61 but not 81", () => {
    expect(amountInWordsFr(21)).toBe("Vingt et un Francs Rwandais Seulement");
    expect(amountInWordsFr(61)).toBe("Soixante et un Francs Rwandais Seulement");
  });

  it("pluralizes 'cent' only when it's an exact multiple of 100", () => {
    expect(amountInWordsFr(200)).toBe("Deux cents Francs Rwandais Seulement");
    expect(amountInWordsFr(230)).toBe("Deux cent trente Francs Rwandais Seulement");
    expect(amountInWordsFr(100)).toBe("Cent Francs Rwandais Seulement");
  });

  it("never pluralizes 'mille' and omits 'un' before a bare thousand", () => {
    expect(amountInWordsFr(1000)).toBe("Mille Francs Rwandais Seulement");
    expect(amountInWordsFr(2000)).toBe("Deux mille Francs Rwandais Seulement");
  });

  it("pluralizes 'million' and keeps 'un' before a bare million", () => {
    expect(amountInWordsFr(1000000)).toBe("Un million Francs Rwandais Seulement");
    expect(amountInWordsFr(2000000)).toBe("Deux millions Francs Rwandais Seulement");
  });

  it("spells out an amount with tens and ones", () => {
    expect(amountInWordsFr(1234567)).toBe(
      "Un million deux cent trente-quatre mille cinq cent soixante-sept Francs Rwandais Seulement",
    );
  });

  it("rounds fractional amounts to the nearest whole franc", () => {
    expect(amountInWordsFr(1234.6)).toBe("Mille deux cent trente-cinq Francs Rwandais Seulement");
  });
});
