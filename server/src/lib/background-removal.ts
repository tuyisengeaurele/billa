import sharp from "sharp";
import { colorDistance, type RgbColor } from "./pixel-color.js";

// How close a pixel's color has to be to the background color to count as
// background itself. Wider than background-detect.ts's corner-uniformity check
// (which is deciding "is this image a good candidate at all") since real photos
// of a solid backdrop have some noise/gradient across it that a flood fill still
// needs to bridge, pixel by connected pixel, to reach the far corners.
const FLOOD_FILL_THRESHOLD = 40;

// A near-fully-flooded result means there was no real foreground/background split
// to find (a solid-color image, say) - erasing that would leave an invisible logo,
// a worse outcome than just not touching it. The route's caller falls back to the
// original, un-removed logo on any error from this function, this included.
const MAX_BACKGROUND_FRACTION = 0.95;

// Runs entirely in this process with sharp - the same way PDF rendering and color
// extraction already work - instead of calling out to a separate ML background-removal
// service. It only handles a solid (or near-solid) background: starting from every
// border pixel, it flood-fills outward through connected pixels close in color to the
// background, and makes only that connected region transparent. A logo mark whose own
// colors happen to resemble the background stays opaque as long as it isn't touching
// the border, because flood fill only removes pixels reachable from the edge.
export async function removeBackground(buffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const background = averageBorderColor(data, width, height, channels);
  const isBackground = floodFillFromBorder(data, width, height, channels, background);

  const backgroundPixelCount = isBackground.reduce((count, flagged) => count + flagged, 0);
  if (backgroundPixelCount / (width * height) > MAX_BACKGROUND_FRACTION) {
    throw new Error("no clear foreground/background split found");
  }

  for (let i = 0; i < width * height; i++) {
    if (isBackground[i]) {
      data[i * channels + 3] = 0;
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

function averageBorderColor(data: Buffer, width: number, height: number, channels: number): RgbColor {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  function sample(x: number, y: number) {
    const idx = (y * width + x) * channels;
    r += data[idx];
    g += data[idx + 1];
    b += data[idx + 2];
    count++;
  }

  for (let x = 0; x < width; x++) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    sample(0, y);
    sample(width - 1, y);
  }

  return { r: r / count, g: g / count, b: b / count };
}

function floodFillFromBorder(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  background: RgbColor,
): Uint8Array {
  const isBackground = new Uint8Array(width * height);
  const stack: number[] = [];

  function visit(x: number, y: number) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const pixelIndex = y * width + x;
    if (isBackground[pixelIndex]) return;
    const idx = pixelIndex * channels;
    const pixel: RgbColor = { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
    if (colorDistance(pixel, background) > FLOOD_FILL_THRESHOLD) return;
    isBackground[pixelIndex] = 1;
    stack.push(pixelIndex);
  }

  for (let x = 0; x < width; x++) {
    visit(x, 0);
    visit(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    visit(0, y);
    visit(width - 1, y);
  }

  while (stack.length > 0) {
    const pixelIndex = stack.pop()!;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    visit(x + 1, y);
    visit(x - 1, y);
    visit(x, y + 1);
    visit(x, y - 1);
  }

  return isBackground;
}
