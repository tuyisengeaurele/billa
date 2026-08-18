import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenUploadPathError, readUploadedFile } from "./uploaded-file.js";

describe("readUploadedFile", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "billa-uploads-"));
    process.env.UPLOADS_DIR = tmpDir;
    await mkdir(path.join(tmpDir, "biz123"), { recursive: true });
    await writeFile(path.join(tmpDir, "biz123", "logo.png"), "logo-bytes");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("reads a file scoped to the business", async () => {
    const buffer = await readUploadedFile("/uploads/biz123/logo.png", "biz123");
    expect(buffer.toString()).toBe("logo-bytes");
  });

  it("rejects a url not starting with /uploads/", async () => {
    await expect(readUploadedFile("/etc/passwd", "biz123")).rejects.toThrow(ForbiddenUploadPathError);
  });

  it("rejects a url belonging to a different business", async () => {
    await expect(readUploadedFile("/uploads/other-biz/logo.png", "biz123")).rejects.toThrow(
      ForbiddenUploadPathError,
    );
  });

  it("rejects a path-traversal attempt", async () => {
    await expect(readUploadedFile("/uploads/biz123/../../../etc/passwd", "biz123")).rejects.toThrow(
      ForbiddenUploadPathError,
    );
  });
});
