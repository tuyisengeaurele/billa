import { isIP } from "node:net";

export type UrlCheck = { ok: true } | { ok: false; reason: string };

const BLOCKED_SUFFIXES = [".local", ".internal", ".localhost", ".lan", ".home"];

function ipv4ToNumber(address: string): number {
  return address.split(".").reduce((total, part) => total * 256 + Number(part), 0);
}

function inRange(address: number, base: string, bits: number): boolean {
  const size = 2 ** (32 - bits);
  const start = ipv4ToNumber(base);
  return address >= start && address < start + size;
}

const PRIVATE_V4 = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const;

/** True for any address a webhook must never be sent to: loopback, private, link-local, multicast and cloud metadata ranges. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const value = ipv4ToNumber(address);
    return PRIVATE_V4.some(([base, bits]) => inRange(value, base, bits));
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateAddress(mapped[1]!);
    const first = parseInt(lower.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
    if ((first & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
    if ((first & 0xff00) === 0xff00) return true; // multicast
    return false;
  }
  return false;
}

/** Checks a URL before it is saved. The address it resolves to is checked again at delivery time (see dispatch.ts). */
export function validateWebhookUrl(raw: string, options: { allowInsecure?: boolean } = {}): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Enter a full URL, like https://example.com/hooks" };
  }
  if (options.allowInsecure) return { ok: true };

  if (url.protocol !== "https:") return { ok: false, reason: "The URL must start with https://" };
  if (url.username || url.password) return { ok: false, reason: "Remove the username and password from the URL" };

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, reason: "That address is not reachable from the internet" };
  }
  if (isIP(host) && isPrivateAddress(host)) {
    return { ok: false, reason: "That address is not reachable from the internet" };
  }
  return { ok: true };
}
