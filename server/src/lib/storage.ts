import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { describeError, type HealthCheckResult } from "./health-check.js";
import { withTimeout } from "./with-timeout.js";

export interface LogoStorage {
  save(buffer: Buffer, businessId: string, extension: string): Promise<{ url: string; path: string }>;
  read(key: string): Promise<Buffer>;
  checkHealth(): Promise<HealthCheckResult>;
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

  async checkHealth(): Promise<HealthCheckResult> {
    try {
      // Local disk is wiped on every redeploy anyway (see render.yaml) - this is
      // only ever the real storage driver in dev, where the process's own working
      // directory is trivially always reachable. Creating it if missing (rather
      // than failing) matches save()'s own behavior above.
      await mkdir(this.uploadsDir, { recursive: true });
      await access(this.uploadsDir);
      return { ok: true, error: null };
    } catch (err) {
      return { ok: false, error: describeError(err) };
    }
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

  async checkHealth(): Promise<HealthCheckResult> {
    try {
      return await withTimeout(
        this.client
          .send(new HeadBucketCommand({ Bucket: this.bucket }))
          .then((): HealthCheckResult => ({ ok: true, error: null })),
        5000,
        { ok: false, error: "Timed out after 5s" },
      );
    } catch (err) {
      return { ok: false, error: describeError(err) };
    }
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

export async function checkStorageHealth(): Promise<HealthCheckResult> {
  try {
    return await getStorage().checkHealth();
  } catch (err) {
    // getStorage() itself throws if STORAGE_DRIVER=r2 is missing its credentials.
    return { ok: false, error: describeError(err) };
  }
}
