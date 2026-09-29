import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./registerServiceWorker";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

// Captures the page-load handler instead of firing a real window event, so a handler
// left by one test can never run during another.
function captureLoadHandler() {
  const addListener = vi.spyOn(window, "addEventListener");
  return () => addListener.mock.calls.find(([type]) => type === "load")?.[1] as (() => void) | undefined;
}

function stubServiceWorker() {
  const register = vi.fn().mockResolvedValue({});
  Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
  return register;
}

describe("registerServiceWorker", () => {
  it("registers /sw.js once the page has loaded in a production build", () => {
    vi.stubEnv("PROD", true);
    const register = stubServiceWorker();
    const loadHandler = captureLoadHandler();

    registerServiceWorker();
    loadHandler()!();

    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("does nothing outside production", () => {
    vi.stubEnv("PROD", false);
    stubServiceWorker();
    const loadHandler = captureLoadHandler();

    registerServiceWorker();

    expect(loadHandler()).toBeUndefined();
  });

  it("does nothing in a browser without service worker support", () => {
    vi.stubEnv("PROD", true);
    const loadHandler = captureLoadHandler();

    registerServiceWorker();

    expect(loadHandler()).toBeUndefined();
  });

  it("swallows a failed registration", async () => {
    vi.stubEnv("PROD", true);
    const register = stubServiceWorker();
    register.mockRejectedValue(new Error("blocked"));
    const loadHandler = captureLoadHandler();

    registerServiceWorker();
    loadHandler()!();

    await expect(register.mock.results[0]!.value).rejects.toThrow("blocked");
  });
});
