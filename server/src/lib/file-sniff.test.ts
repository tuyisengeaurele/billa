import { describe, expect, it } from "vitest";
import { detectAllowedImageType } from "./file-sniff.js";

const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("detectAllowedImageType", () => {
  it("accepts a real PNG", async () => {
    const result = await detectAllowedImageType(MINIMAL_PNG);
    expect(result).toEqual({ ext: "png", mime: "image/png" });
  });

  it("rejects a plain text buffer pretending to be an image", async () => {
    const result = await detectAllowedImageType(Buffer.from("not actually an image"));
    expect(result).toBeNull();
  });
});
