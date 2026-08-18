import { describe, expect, it } from "vitest";
import { contrastRatio, darkenUntilContrast } from "./color.js";

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
