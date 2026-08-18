import path from "node:path";
import { readFile } from "node:fs/promises";

export class ForbiddenUploadPathError extends Error {}

export async function readUploadedFile(url: string, businessId: string): Promise<Buffer> {
  if (!url.startsWith("/uploads/")) {
    throw new ForbiddenUploadPathError();
  }

  const uploadsRoot = path.resolve(process.env.UPLOADS_DIR ?? "./uploads");
  const businessDir = path.resolve(uploadsRoot, businessId);
  const filePath = path.resolve(uploadsRoot, url.slice("/uploads/".length));

  if (!filePath.startsWith(businessDir + path.sep)) {
    throw new ForbiddenUploadPathError();
  }

  return readFile(filePath);
}
