import { describe, expect, it } from "vitest";
import { normalizeRwandaPhoneNumber } from "./phone-number.js";

describe("normalizeRwandaPhoneNumber", () => {
  it("replaces a leading 0 with the 250 country code", () => {
    expect(normalizeRwandaPhoneNumber("0788123456")).toBe("250788123456");
  });

  it("strips spaces from a locally formatted number", () => {
    expect(normalizeRwandaPhoneNumber("078 812 3456")).toBe("250788123456");
  });

  it("strips a leading +", () => {
    expect(normalizeRwandaPhoneNumber("+250788123456")).toBe("250788123456");
  });

  it("leaves an already-correct MSISDN unchanged", () => {
    expect(normalizeRwandaPhoneNumber("250788123456")).toBe("250788123456");
  });

  it("adds the country code to a bare 9-digit subscriber number", () => {
    expect(normalizeRwandaPhoneNumber("788123456")).toBe("250788123456");
  });

  it("strips dashes and parentheses too", () => {
    expect(normalizeRwandaPhoneNumber("(078) 812-3456")).toBe("250788123456");
  });
});
