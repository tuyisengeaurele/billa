import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { readLogoDataUri } from "./logo.js";

const UPLOADS_DIR = "./uploads-test-pdf-logo";
const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

beforeAll(async () => {
  process.env.UPLOADS_DIR = UPLOADS_DIR;
  await rm(UPLOADS_DIR, { recursive: true, force: true });
  await mkdir(path.join(UPLOADS_DIR, "biz1"), { recursive: true });
  await writeFile(path.join(UPLOADS_DIR, "biz1", "logo.png"), MINIMAL_PNG);
});

describe("readLogoDataUri", () => {
  it("returns null when there is no logo url", async () => {
    expect(await readLogoDataUri(null, "biz1")).toBeNull();
  });

  it("returns a base64 data URI for a real logo file", async () => {
    const result = await readLogoDataUri("/uploads/biz1/logo.png", "biz1");
    expect(result).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
  });

  it("returns null when the file does not exist on disk", async () => {
    const result = await readLogoDataUri("/uploads/biz1/missing.png", "biz1");
    expect(result).toBeNull();
  });

  it("returns null when the url points outside the business's own folder", async () => {
    const result = await readLogoDataUri("/uploads/other-biz/logo.png", "biz1");
    expect(result).toBeNull();
  });
});
