import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface LogoStorage {
  save(buffer: Buffer, businessId: string, extension: string): Promise<{ url: string; path: string }>;
  read(key: string): Promise<Buffer>;
}

export class LocalDiskStorage implements LogoStorage {
  constructor(private readonly uploadsDir: string) {}

  async save(buffer: Buffer, businessId: string, extension: string): Promise<{ url: string; path: string }> {
    const key = `${businessId}/${randomUUID()}.${extension}`;
    const filePath = path.join(this.uploadsDir, key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    return { url: `/uploads/${key}`, path: key };
  }

  async read(key: string): Promise<Buffer> {
    return readFile(path.join(this.uploadsDir, key));
  }
}

export interface R2StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export class R2Storage implements LogoStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: R2StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async save(buffer: Buffer, businessId: string, extension: string): Promise<{ url: string; path: string }> {
    const key = `${businessId}/${randomUUID()}.${extension}`;
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer }));
    return { url: `/uploads/${key}`, path: key };
  }

  async read(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await result.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
}

export function getStorage(): LogoStorage {
  if (process.env.STORAGE_DRIVER === "r2") {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET;
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error(
        "STORAGE_DRIVER=r2 requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET to be set",
      );
    }
    return new R2Storage({ accountId, accessKeyId, secretAccessKey, bucket });
  }
  return new LocalDiskStorage(process.env.UPLOADS_DIR ?? "./uploads");
}
