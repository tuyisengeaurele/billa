import { getStorage } from "./storage.js";

export class ForbiddenUploadPathError extends Error {}

export async function readUploadedFile(url: string, businessId: string): Promise<Buffer> {
  if (!url.startsWith("/uploads/")) {
    throw new ForbiddenUploadPathError();
  }

  const key = url.slice("/uploads/".length);
  const segments = key.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new ForbiddenUploadPathError();
  }
  if (segments[0] !== businessId) {
    throw new ForbiddenUploadPathError();
  }

  return getStorage().read(key);
}
