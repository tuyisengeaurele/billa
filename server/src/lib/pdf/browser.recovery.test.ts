import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { launchMock } = vi.hoisted(() => ({ launchMock: vi.fn() }));
vi.mock("puppeteer", () => ({ default: { launch: launchMock } }));

import { closeBrowser, renderHtmlToPdfBuffer } from "./browser.js";

function fakeBrowser(pdfDelayMs = 0, tracker?: { running: number; peak: number }) {
  const handlers: Record<string, () => void> = {};
  const browser = {
    handlers,
    on: vi.fn((event: string, handler: () => void) => {
      handlers[event] = handler;
    }),
    newPage: vi.fn(async () => ({
      setDefaultTimeout: vi.fn(),
      setContent: vi.fn(async () => {}),
      pdf: vi.fn(async () => {
        if (tracker) {
          tracker.running++;
          tracker.peak = Math.max(tracker.peak, tracker.running);
        }
        await new Promise((resolve) => setTimeout(resolve, pdfDelayMs));
        if (tracker) tracker.running--;
        return new Uint8Array([37, 80, 68, 70]);
      }),
      close: vi.fn(async () => {}),
    })),
    close: vi.fn(async () => {}),
  };
  return browser;
}

beforeEach(() => {
  launchMock.mockReset();
});

afterEach(async () => {
  await closeBrowser();
});

describe("PDF browser recovery", () => {
  it("launches a fresh browser after the old one disconnects, instead of failing every render from then on", async () => {
    const first = fakeBrowser();
    const second = fakeBrowser();
    launchMock.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    await renderHtmlToPdfBuffer("<p>one</p>");
    first.handlers.disconnected!();
    const buffer = await renderHtmlToPdfBuffer("<p>two</p>");

    expect(launchMock).toHaveBeenCalledTimes(2);
    expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("reuses one browser while it stays connected", async () => {
    launchMock.mockResolvedValue(fakeBrowser());

    await renderHtmlToPdfBuffer("<p>one</p>");
    await renderHtmlToPdfBuffer("<p>two</p>");

    expect(launchMock).toHaveBeenCalledTimes(1);
  });

  it("does not let a failed launch stick: the next render tries again", async () => {
    launchMock.mockRejectedValueOnce(new Error("no chrome")).mockResolvedValueOnce(fakeBrowser());

    await expect(renderHtmlToPdfBuffer("<p>one</p>")).rejects.toThrow("no chrome");
    const buffer = await renderHtmlToPdfBuffer("<p>two</p>");

    expect(buffer.length).toBe(4);
    expect(launchMock).toHaveBeenCalledTimes(2);
  });

  it("renders at most two pages at a time however many are asked for", async () => {
    const tracker = { running: 0, peak: 0 };
    launchMock.mockResolvedValue(fakeBrowser(15, tracker));

    await Promise.all(Array.from({ length: 6 }, (_, i) => renderHtmlToPdfBuffer(`<p>${i}</p>`)));

    expect(tracker.peak).toBe(2);
  });
});
