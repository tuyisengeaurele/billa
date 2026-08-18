import sharp from "sharp";

export interface BackgroundDetection {
  hasTransparency: boolean;
  cornersUniform: boolean;
  needsRemoval: boolean;
}

const TRANSPARENCY_ALPHA_THRESHOLD = 250;
const TRANSPARENCY_PIXEL_FRACTION = 0.01;
const CORNER_COLOR_DISTANCE_THRESHOLD = 20;

export async function detectBackground(buffer: Buffer): Promise<BackgroundDetection> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const hasTransparency = hasMeaningfulTransparency(data, info.width, info.height);
  const cornersUniform = hasTransparency
    ? false
    : areCornersUniform(data, info.width, info.height, info.channels);

  return {
    hasTransparency,
    cornersUniform,
    needsRemoval: !hasTransparency,
  };
}

function hasMeaningfulTransparency(data: Buffer, width: number, height: number): boolean {
  const totalPixels = width * height;
  let transparentCount = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < TRANSPARENCY_ALPHA_THRESHOLD) transparentCount++;
  }
  return transparentCount / totalPixels > TRANSPARENCY_PIXEL_FRACTION;
}

function areCornersUniform(data: Buffer, width: number, height: number, channels: number): boolean {
  const corners = [
    getPixel(data, width, channels, 0, 0),
    getPixel(data, width, channels, width - 1, 0),
    getPixel(data, width, channels, 0, height - 1),
    getPixel(data, width, channels, width - 1, height - 1),
  ];
  for (let i = 1; i < corners.length; i++) {
    if (colorDistance(corners[0], corners[i]) > CORNER_COLOR_DISTANCE_THRESHOLD) {
      return false;
    }
  }
  return true;
}

function getPixel(data: Buffer, width: number, channels: number, x: number, y: number) {
  const idx = (y * width + x) * channels;
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
}

function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}
