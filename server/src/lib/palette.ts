import { Vibrant } from "node-vibrant/node";
import { contrastRatio, darkenUntilContrast } from "./color.js";

export interface ExtractedPalette {
  primaryColor: string;
  accentColors: string[];
  contrastRatio: number;
}

const MIN_CONTRAST_RATIO = 3;
const WHITE = "#FFFFFF";

export async function extractPalette(buffer: Buffer): Promise<ExtractedPalette> {
  const palette = await Vibrant.from(buffer).getPalette();

  const candidates = [
    palette.Vibrant,
    palette.DarkVibrant,
    palette.Muted,
    palette.DarkMuted,
    palette.LightVibrant,
    palette.LightMuted,
  ]
    .filter((swatch): swatch is NonNullable<typeof swatch> => swatch != null)
    .sort((a, b) => b.population - a.population);

  if (candidates.length === 0) {
    throw new Error("no usable colors found in image");
  }

  let primaryHex = candidates[0].hex.toUpperCase();
  let ratio = contrastRatio(primaryHex, WHITE);

  for (const candidate of candidates) {
    const candidateRatio = contrastRatio(candidate.hex, WHITE);
    if (candidateRatio >= MIN_CONTRAST_RATIO) {
      primaryHex = candidate.hex.toUpperCase();
      ratio = candidateRatio;
      break;
    }
  }

  if (ratio < MIN_CONTRAST_RATIO) {
    const darkened = darkenUntilContrast(primaryHex, MIN_CONTRAST_RATIO);
    primaryHex = darkened.hex;
    ratio = darkened.ratio;
  }

  const accentColors = candidates
    .map((c) => c.hex.toUpperCase())
    .filter((hex) => hex !== primaryHex)
    .slice(0, 3);

  return { primaryColor: primaryHex, accentColors, contrastRatio: ratio };
}
