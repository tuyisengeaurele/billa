import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDiskStorage } from "./storage.js";

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
    const written = await readFile(result.path);
    expect(written.toString()).toBe("fake-image-bytes");
  });

  it("generates unique filenames for repeated saves", async () => {
    const storage = new LocalDiskStorage(tmpDir);
    const first = await storage.save(Buffer.from("a"), "biz123", "png");
    const second = await storage.save(Buffer.from("b"), "biz123", "png");
    expect(first.url).not.toBe(second.url);
  });
});
