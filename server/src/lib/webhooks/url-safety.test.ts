import { describe, expect, it } from "vitest";
import { isPrivateAddress, validateWebhookUrl } from "./url-safety.js";

describe("validateWebhookUrl", () => {
  it("accepts a public https URL", () => {
    expect(validateWebhookUrl("https://hooks.example.com/billa")).toEqual({ ok: true });
  });

  it("rejects plain http, other schemes and junk", () => {
    expect(validateWebhookUrl("http://hooks.example.com/billa").ok).toBe(false);
    expect(validateWebhookUrl("ftp://hooks.example.com").ok).toBe(false);
    expect(validateWebhookUrl("not a url").ok).toBe(false);
    expect(validateWebhookUrl("").ok).toBe(false);
  });

  it("rejects a URL with embedded credentials", () => {
    expect(validateWebhookUrl("https://user:pass@hooks.example.com/").ok).toBe(false);
  });

  it("rejects localhost and private or link-local addresses written into the URL", () => {
    for (const url of [
      "https://localhost/hook",
      "https://127.0.0.1/hook",
      "https://10.0.0.5/hook",
      "https://192.168.1.10/hook",
      "https://172.16.0.1/hook",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/hook",
      "https://internal.local/hook",
      "https://service.internal/hook",
    ]) {
      expect(validateWebhookUrl(url).ok, url).toBe(false);
    }
  });

  it("allows http and localhost only when explicitly permitted, for development", () => {
    expect(validateWebhookUrl("http://localhost:4000/hook", { allowInsecure: true })).toEqual({ ok: true });
  });
});

describe("isPrivateAddress", () => {
  it("flags loopback, private, link-local and unspecified IPv4 ranges", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "172.31.255.255", "192.168.0.1", "169.254.1.1", "0.0.0.0", "100.64.0.1"]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it("flags IPv6 loopback, unique-local, link-local and mapped private addresses", () => {
    for (const address of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it("lets public addresses through", () => {
    for (const address of ["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700:4700::1111"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });
});
