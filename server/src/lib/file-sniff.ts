import { fileTypeFromBuffer } from "file-type";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

// A PDF starts with "%PDF-" (sometimes after a few stray bytes). The extension and the browser's
// claimed type are not trusted, only what the file itself says.
export function detectPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 1024).includes("%PDF-");
}

export async function detectAllowedImageType(
  buffer: Buffer,
): Promise<{ ext: string; mime: string } | null> {
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    return null;
  }
  return detected;
}
