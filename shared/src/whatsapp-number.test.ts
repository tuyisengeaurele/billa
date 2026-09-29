import { describe, expect, it } from "vitest";
import { toWhatsAppNumber } from "./whatsapp-number.js";

describe("toWhatsAppNumber", () => {
  it("adds the country code to a local number", () => {
    expect(toWhatsAppNumber("0788 123 456")).toBe("250788123456");
  });

  it("keeps a number that already has the country code", () => {
    expect(toWhatsAppNumber("+250 788 123 456")).toBe("250788123456");
  });

  it("adds the country code to a nine digit number", () => {
    expect(toWhatsAppNumber("788123456")).toBe("250788123456");
  });

  it("strips a 00 international prefix", () => {
    expect(toWhatsAppNumber("00254712345678")).toBe("254712345678");
  });

  it("keeps a foreign number written with its country code", () => {
    expect(toWhatsAppNumber("+254 712 345 678")).toBe("254712345678");
  });

  it("returns null for empty or missing input", () => {
    expect(toWhatsAppNumber("")).toBeNull();
    expect(toWhatsAppNumber(null)).toBeNull();
    expect(toWhatsAppNumber(undefined)).toBeNull();
  });

  it("returns null for something too short to be a phone number", () => {
    expect(toWhatsAppNumber("12345")).toBeNull();
  });
});
