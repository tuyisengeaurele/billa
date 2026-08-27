import { afterAll, describe, expect, it } from "vitest";
import { renderHtmlToPdfBuffer, checkPdfRenderingHealth, closeBrowser } from "./browser.js";

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

describe("checkPdfRenderingHealth", () => {
  afterAll(async () => {
    await closeBrowser();
  });

  it(
    "reports true when the headless browser can render",
    async () => {
      expect(await checkPdfRenderingHealth()).toBe(true);
    },
    15000,
  );
});
