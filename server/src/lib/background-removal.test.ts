import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { removeBackground } from "./background-removal.js";

const WIDTH = 20;
const HEIGHT = 20;
const WHITE = { r: 255, g: 255, b: 255 };
const RED = { r: 220, g: 30, b: 30 };

// Builds a WIDTH x HEIGHT opaque PNG: `paint(x, y)` decides each pixel's RGB.
async function buildImage(paint: (x: number, y: number) => { r: number; g: number; b: number }): Promise<Buffer> {
  const raw = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const { r, g, b } = paint(x, y);
      const idx = (y * WIDTH + x) * 4;
      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = 255;
    }
  }
  return sharp(raw, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png().toBuffer();
}

async function alphaAt(buffer: Buffer, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return data[idx + 3];
}

describe("removeBackground", () => {
  it("makes a solid white background transparent, keeping a centered logo mark opaque", async () => {
    // A 6x6 red square centered on a 20x20 white canvas.
    const input = await buildImage((x, y) => (x >= 7 && x < 13 && y >= 7 && y < 13 ? RED : WHITE));

    const result = await removeBackground(input);

    expect(await alphaAt(result, 0, 0)).toBe(0);
    expect(await alphaAt(result, WIDTH - 1, HEIGHT - 1)).toBe(0);
    expect(await alphaAt(result, 10, 10)).toBe(255);
  });

  it("does not erase a white patch inside the logo that never touches the border", async () => {
    // A 10x10 red square with a 2x2 white "hole" in its middle - that hole is
    // background-colored but isn't connected to the canvas border, so a flood fill
    // (unlike a naive "erase every background-colored pixel") must leave it alone.
    const input = await buildImage((x, y) => {
      const inRedSquare = x >= 5 && x < 15 && y >= 5 && y < 15;
      const inHole = x >= 9 && x < 11 && y >= 9 && y < 11;
      if (inHole) return WHITE;
      return inRedSquare ? RED : WHITE;
    });

    const result = await removeBackground(input);

    expect(await alphaAt(result, 0, 0)).toBe(0);
    expect(await alphaAt(result, 7, 7)).toBe(255);
    // The enclosed white hole is unreachable from the border, so it stays opaque.
    expect(await alphaAt(result, 9, 9)).toBe(255);
  });

  it("refuses to process a solid-color image instead of erasing the whole thing", async () => {
    // With nothing but background-colored pixels, flood fill floods the entire
    // canvas - silently returning that would hand back an invisible logo, which is
    // worse than doing nothing. The caller (the /remove-background route) treats
    // this the same as any other failure and falls back to the original upload.
    const input = await buildImage(() => RED);

    await expect(removeBackground(input)).rejects.toThrow();
  });
});
