import { afterAll, describe, expect, it } from "vitest";
import { renderHtmlToPdfBuffer, closeBrowser } from "./browser.js";

describe("renderHtmlToPdfBuffer", () => {
  afterAll(async () => {
    await closeBrowser();
  });

  it(
    "renders HTML to a real PDF buffer",
    async () => {
      const buffer = await renderHtmlToPdfBuffer("<html><body><h1>hello</h1></body></html>");
      expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
    },
    15000,
  );
});
