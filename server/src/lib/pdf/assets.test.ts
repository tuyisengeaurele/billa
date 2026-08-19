import { describe, expect, it } from "vitest";
import { FONT_FACE_CSS } from "./assets.js";

describe("FONT_FACE_CSS", () => {
  it("embeds both brand fonts as base64 data URIs", () => {
    expect(FONT_FACE_CSS).toContain('font-family: "Fraunces"');
    expect(FONT_FACE_CSS).toContain('font-family: "Plus Jakarta Sans"');
    expect(FONT_FACE_CSS).toMatch(/data:font\/woff2;base64,[A-Za-z0-9+/]+/);
  });
});
