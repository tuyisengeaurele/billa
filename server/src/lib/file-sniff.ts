import { fileTypeFromBuffer } from "file-type";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function detectAllowedImageType(
  buffer: Buffer,
): Promise<{ ext: string; mime: string } | null> {
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    return null;
  }
  return detected;
}
