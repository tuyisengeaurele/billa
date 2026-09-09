import puppeteer, { type Browser } from "puppeteer";
import { withTimeout } from "../with-timeout.js";

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      // Containers (CI runners, and every PaaS this deploys to - Render, Railway, Fly)
      // don't have a working setuid sandbox, so Chromium fails to launch at all without
      // this flag. Safe to apply unconditionally: this browser only ever renders our own
      // generated, escaped document HTML, never arbitrary or user-supplied content.
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browserPromise;
}

export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    page.setDefaultTimeout(10000);
    await page.setContent(html, { waitUntil: "load" });
    const pdfBytes = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdfBytes);
  } finally {
    await page.close();
  }
}

export async function checkPdfRenderingHealth(): Promise<boolean> {
  try {
    // A cold launch (first render since the process started) is legitimately
    // slower than the other checks, so this gets more headroom than their 5s -
    // still bounded, so a genuinely stuck browser can't hang the whole endpoint.
    return await withTimeout(
      renderHtmlToPdfBuffer("<html><body>health check</body></html>").then(() => true),
      10000,
      false,
    );
  } catch {
    return false;
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}
