import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface LogoStorage {
  save(buffer: Buffer, businessId: string, extension: string): Promise<{ url: string; path: string }>;
}

export class LocalDiskStorage implements LogoStorage {
  constructor(private readonly uploadsDir: string) {}

  async save(buffer: Buffer, businessId: string, extension: string): Promise<{ url: string; path: string }> {
    const dir = path.join(this.uploadsDir, businessId);
    await mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    const filePath = path.join(dir, filename);
    await writeFile(filePath, buffer);
    return { url: `/uploads/${businessId}/${filename}`, path: filePath };
  }
}
