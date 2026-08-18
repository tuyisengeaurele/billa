import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { detectBackground } from "./background-detect.js";

describe("detectBackground", () => {
  it("detects meaningful transparency and skips the corner check", async () => {
    const buffer = await sharp({
      create: { width: 10, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();

    const result = await detectBackground(buffer);

    expect(result.hasTransparency).toBe(true);
    expect(result.needsRemoval).toBe(false);
  });

  it("flags an opaque uniform-background image as needing removal, with uniform corners", async () => {
    const buffer = await sharp({
      create: { width: 10, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const result = await detectBackground(buffer);

    expect(result.hasTransparency).toBe(false);
    expect(result.needsRemoval).toBe(true);
    expect(result.cornersUniform).toBe(true);
  });

  it("flags non-uniform corners on an opaque image with a differently-colored region", async () => {
    const blackSquare = await sharp({
      create: { width: 3, height: 3, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const buffer = await sharp({
      create: { width: 10, height: 10, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    })
      .composite([{ input: blackSquare, left: 0, top: 0 }])
      .png()
      .toBuffer();

    const result = await detectBackground(buffer);

    expect(result.hasTransparency).toBe(false);
    expect(result.cornersUniform).toBe(false);
  });
});
