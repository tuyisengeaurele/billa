import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalDiskStorage, checkStorageHealth } from "./storage.js";

describe("LocalDiskStorage", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "billa-uploads-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes the buffer to disk and returns a url scoped to the business", async () => {
    const storage = new LocalDiskStorage(tmpDir);
    const result = await storage.save(Buffer.from("fake-image-bytes"), "biz123", "png");

    expect(result.url).toMatch(/^\/uploads\/biz123\/[\w-]+\.png$/);
    expect(result.path).toBe(result.url.replace("/uploads/", ""));
    const written = await readFile(path.join(tmpDir, result.path));
    expect(written.toString()).toBe("fake-image-bytes");
  });

  it("generates unique filenames for repeated saves", async () => {
    const storage = new LocalDiskStorage(tmpDir);
    const first = await storage.save(Buffer.from("a"), "biz123", "png");
    const second = await storage.save(Buffer.from("b"), "biz123", "png");
    expect(first.url).not.toBe(second.url);
  });

  it("reads back a saved file by its key", async () => {
    const storage = new LocalDiskStorage(tmpDir);
    const saved = await storage.save(Buffer.from("hello"), "biz123", "png");
    const buffer = await storage.read(saved.path);
    expect(buffer.toString()).toBe("hello");
  });

  it("reports healthy when the uploads directory is reachable, creating it if missing", async () => {
    const freshDir = path.join(tmpDir, "not-created-yet");
    const storage = new LocalDiskStorage(freshDir);

    expect(await storage.checkHealth()).toEqual({ ok: true, error: null });
  });
});

describe("checkStorageHealth", () => {
  it("resolves the configured driver and reports its health", async () => {
    // STORAGE_DRIVER is unset here (this file never sets it to "r2"), so this
    // resolves to LocalDiskStorage against the test suite's own UPLOADS_DIR.
    expect(await checkStorageHealth()).toEqual({ ok: true, error: null });
  });
});

const sendMock = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: sendMock })),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
  HeadBucketCommand: vi.fn().mockImplementation((input) => ({ input })),
}));

const { R2Storage } = await import("./storage.js");

describe("R2Storage", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("uploads the buffer under a key scoped to the business and returns a url", async () => {
    sendMock.mockResolvedValueOnce({});
    const storage = new R2Storage({
      accountId: "acct123",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "billa-uploads",
    });

    const result = await storage.save(Buffer.from("fake-image-bytes"), "biz123", "png");

    expect(result.url).toMatch(/^\/uploads\/biz123\/[\w-]+\.png$/);
    expect(result.path).toBe(result.url.replace("/uploads/", ""));
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [command] = sendMock.mock.calls[0];
    expect(command.input).toMatchObject({ Bucket: "billa-uploads", Key: result.path });
    expect(Buffer.from(command.input.Body).toString()).toBe("fake-image-bytes");
  });

  it("reads an object back as a buffer", async () => {
    sendMock.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array(Buffer.from("hello")) },
    });
    const storage = new R2Storage({
      accountId: "acct123",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "billa-uploads",
    });

    const buffer = await storage.read("biz123/logo.png");

    expect(buffer.toString()).toBe("hello");
    const [command] = sendMock.mock.calls[0];
    expect(command.input).toMatchObject({ Bucket: "billa-uploads", Key: "biz123/logo.png" });
  });

  it("reports healthy when the bucket responds", async () => {
    sendMock.mockResolvedValueOnce({});
    const storage = new R2Storage({
      accountId: "acct123",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "billa-uploads",
    });

    expect(await storage.checkHealth()).toEqual({ ok: true, error: null });
    const [command] = sendMock.mock.calls[0];
    expect(command.input).toMatchObject({ Bucket: "billa-uploads" });
  });

  it("reports the real error when the bucket is unreachable", async () => {
    sendMock.mockRejectedValueOnce(new Error("access denied"));
    const storage = new R2Storage({
      accountId: "acct123",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "billa-uploads",
    });

    expect(await storage.checkHealth()).toEqual({ ok: false, error: "access denied" });
  });
});
