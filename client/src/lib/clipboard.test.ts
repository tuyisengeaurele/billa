import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "./clipboard";

describe("copyToClipboard", () => {
  beforeEach(() => {
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: vi.fn() },
        configurable: true,
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the async Clipboard API when it succeeds", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    const succeeded = await copyToClipboard("hello");

    expect(succeeded).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand when the Clipboard API is blocked", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("blocked"));
    document.execCommand = vi.fn().mockReturnValue(true);

    const succeeded = await copyToClipboard("hello");

    expect(succeeded).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("returns false when both methods fail", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("blocked"));
    document.execCommand = vi.fn().mockReturnValue(false);

    const succeeded = await copyToClipboard("hello");

    expect(succeeded).toBe(false);
  });
});
