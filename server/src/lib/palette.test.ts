import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { extractPalette } from "./palette.js";

async function makeTwoToneImage(): Promise<Buffer> {
  const square = await sharp({
    create: { width: 40, height: 40, channels: 3, background: { r: 230, g: 60, b: 40 } },
  })
    .png()
    .toBuffer();

  return sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 20, g: 90, b: 200 } },
  })
    .composite([{ input: square, left: 30, top: 30 }])
    .png()
    .toBuffer();
}

describe("extractPalette", () => {
  it("returns a primary color with sufficient contrast against white", async () => {
    const buffer = await makeTwoToneImage();
    const result = await extractPalette(buffer);

    expect(result.primaryColor).toMatch(/^#[0-9A-F]{6}$/);
    expect(result.contrastRatio).toBeGreaterThanOrEqual(3);
  });

  it("returns up to 3 accent colors distinct from the primary", async () => {
    const buffer = await makeTwoToneImage();
    const result = await extractPalette(buffer);

    expect(result.accentColors.length).toBeLessThanOrEqual(3);
    expect(result.accentColors).not.toContain(result.primaryColor);
  });
});
