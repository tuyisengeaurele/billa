import puppeteer, { type Browser } from "puppeteer";

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
    await renderHtmlToPdfBuffer("<html><body>health check</body></html>");
    return true;
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
