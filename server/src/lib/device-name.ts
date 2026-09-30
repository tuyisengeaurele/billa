const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser/, "Samsung Internet"],
  [/Firefox\/|FxiOS/, "Firefox"],
  [/Chrome\/|CriOS/, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "Mac"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

export const UNKNOWN_DEVICE = "Unknown device";

/**
 * A short, readable name for where a session was opened, such as "Chrome on Windows" or "Safari on iPhone".
 * The mobile app can send its own name in a header, which wins over anything read from the user agent.
 */
export function describeDevice(userAgent: string | undefined, appName?: string | undefined): string {
  const named = appName?.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60);
  if (named) return named;

  const agent = userAgent ?? "";
  // The Flutter app's HTTP client identifies itself as Dart and says nothing about the phone.
  if (/^Dart\//.test(agent)) return "Billa app";

  const browser = BROWSERS.find(([pattern]) => pattern.test(agent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(agent))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return system ?? browser ?? UNKNOWN_DEVICE;
}
