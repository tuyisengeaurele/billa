import { describe, expect, it } from "vitest";
import { formatRwf } from "./money.js";

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
