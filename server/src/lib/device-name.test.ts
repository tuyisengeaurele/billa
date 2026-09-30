import { describe, expect, it } from "vitest";
import { describeDevice } from "./device-name.js";

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EDGE_WINDOWS = `${CHROME_WINDOWS} Edg/126.0.0.0`;
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0";
const CHROME_ON_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1";

describe("describeDevice", () => {
  it("names the browser and the system", () => {
    expect(describeDevice(CHROME_WINDOWS)).toBe("Chrome on Windows");
    expect(describeDevice(SAFARI_IPHONE)).toBe("Safari on iPhone");
    expect(describeDevice(CHROME_ANDROID)).toBe("Chrome on Android");
    expect(describeDevice(SAFARI_MAC)).toBe("Safari on Mac");
    expect(describeDevice(FIREFOX_LINUX)).toBe("Firefox on Linux");
  });

  it("does not mistake Edge or Chrome on an iPhone for the browser they are built on", () => {
    expect(describeDevice(EDGE_WINDOWS)).toBe("Edge on Windows");
    expect(describeDevice(CHROME_ON_IPHONE)).toBe("Chrome on iPhone");
  });

  it("calls the Flutter app's HTTP client the Billa app", () => {
    expect(describeDevice("Dart/3.4 (dart:io)")).toBe("Billa app");
  });

  it("lets the app name itself, cleaned up and kept short", () => {
    expect(describeDevice(CHROME_ANDROID, "Billa app on Pixel 8")).toBe("Billa app on Pixel 8");
    expect(describeDevice(CHROME_ANDROID, "x".repeat(200))).toHaveLength(60);
    expect(describeDevice(CHROME_ANDROID, "  \u0007  ")).toBe("Chrome on Android");
  });

  it("falls back when there is nothing to go on", () => {
    expect(describeDevice(undefined)).toBe("Unknown device");
    expect(describeDevice("curl/8.0")).toBe("Unknown device");
  });
});
