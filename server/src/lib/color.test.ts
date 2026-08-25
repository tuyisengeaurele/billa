import { describe, expect, it } from "vitest";
import { contrastRatio, darkenUntilContrast, pickStructuralDark } from "./color.js";

describe("contrastRatio", () => {
  it("returns 21 for black on white (max contrast)", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });

  it("returns 1 for identical colors (no contrast)", () => {
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("is symmetric regardless of argument order", () => {
    const a = contrastRatio("#FF0000", "#FFFFFF");
    const b = contrastRatio("#FFFFFF", "#FF0000");
    expect(a).toBeCloseTo(b, 10);
  });
});

describe("darkenUntilContrast", () => {
  it("darkens a low-contrast light color until it meets the threshold", () => {
    const result = darkenUntilContrast("#FFEE99", 3);
    expect(result.ratio).toBeGreaterThanOrEqual(3);
  });

  it("leaves an already-sufficient color's ratio essentially unchanged", () => {
    const before = contrastRatio("#000000", "#FFFFFF");
    const result = darkenUntilContrast("#000000", 3);
    expect(result.ratio).toBeCloseTo(before, 5);
  });
});

describe("pickStructuralDark", () => {
  it("picks the darkest of the logo-extracted accent colors over the primary", () => {
    // primary is a bright pink; one of the extracted accents is a navy the logo also contains
    const result = pickStructuralDark("#C2185B", ["#F5A9C6", "#0D2A4A"]);
    expect(result.toUpperCase()).toBe("#0D2A4A");
  });

  it("falls back to darkening the primary color when there are no accent colors", () => {
    const result = pickStructuralDark("#F9A8D4", []);
    expect(contrastRatio(result, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("still darkens the chosen candidate further if it doesn't yet contrast enough with white", () => {
    const result = pickStructuralDark("#C2185B", ["#E8A0BE"]);
    expect(contrastRatio(result, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("leaves an already-dark primary color close to itself when there are no accents", () => {
    expect(pickStructuralDark("#1A1A2E", [])).toBe("#1A1A2E");
  });
});
