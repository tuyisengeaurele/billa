import { readUploadedFile } from "../uploaded-file.js";
import { detectAllowedImageType } from "../file-sniff.js";

export async function readLogoDataUri(
  logoUrl: string | null,
  businessId: string,
): Promise<string | null> {
  if (!logoUrl) {
    return null;
  }

  try {
    const buffer = await readUploadedFile(logoUrl, businessId);
    const detected = await detectAllowedImageType(buffer);
    if (!detected) {
      return null;
    }
    return `data:${detected.mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}
