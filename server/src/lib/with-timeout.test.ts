import { describe, expect, it, vi } from "vitest";
import { withTimeout } from "./with-timeout.js";

describe("withTimeout", () => {
  it("resolves with the promise's own value when it finishes before the deadline", async () => {
    const result = await withTimeout(Promise.resolve("real value"), 1000, "fallback");
    expect(result).toBe("real value");
  });

  it("falls back to the timeout value instead of waiting forever for a promise that never settles", async () => {
    vi.useFakeTimers();
    const hung = new Promise(() => {});

    const promise = withTimeout(hung, 5000, "timed out");
    await vi.advanceTimersByTimeAsync(5000);

    await expect(promise).resolves.toBe("timed out");
    vi.useRealTimers();
  });
});
