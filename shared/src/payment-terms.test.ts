import { describe, expect, it } from "vitest";
import { addDaysToDate, daysBetweenDates, matchPaymentTerm, PAYMENT_TERM_OPTIONS } from "./payment-terms.js";

describe("addDaysToDate", () => {
  it("adds days across a month boundary", () => {
    expect(addDaysToDate("2026-09-20", 30)).toBe("2026-10-20");
  });

  it("adds days across a year boundary", () => {
    expect(addDaysToDate("2026-12-20", 14)).toBe("2027-01-03");
  });

  it("returns the same date for zero days", () => {
    expect(addDaysToDate("2026-09-20", 0)).toBe("2026-09-20");
  });
});

describe("daysBetweenDates", () => {
  it("counts whole days", () => {
    expect(daysBetweenDates("2026-09-01", "2026-09-30")).toBe(29);
  });

  it("is negative when the second date is earlier", () => {
    expect(daysBetweenDates("2026-09-10", "2026-09-05")).toBe(-5);
  });
});

describe("matchPaymentTerm", () => {
  it("finds the preset that matches the gap between the dates", () => {
    expect(matchPaymentTerm("2026-09-01", "2026-10-01")).toBe(30);
    expect(matchPaymentTerm("2026-09-01", "2026-09-01")).toBe(0);
  });

  it("returns null for a gap that is not a preset", () => {
    expect(matchPaymentTerm("2026-09-01", "2026-09-12")).toBeNull();
  });

  it("returns null when a date is missing", () => {
    expect(matchPaymentTerm("2026-09-01", "")).toBeNull();
    expect(matchPaymentTerm("", "2026-09-01")).toBeNull();
  });
});

describe("PAYMENT_TERM_OPTIONS", () => {
  it("starts with due on receipt and ends with the longest term", () => {
    expect(PAYMENT_TERM_OPTIONS[0]).toEqual({ days: 0, label: "Due on receipt" });
    expect(PAYMENT_TERM_OPTIONS.at(-1)).toEqual({ days: 60, label: "Net 60" });
  });
});
