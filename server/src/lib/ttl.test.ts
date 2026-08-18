import { describe, expect, it } from "vitest";
import { ttlToMs } from "./ttl.js";

describe("ttlToMs", () => {
  it("parses seconds", () => {
    expect(ttlToMs("30s")).toBe(30 * 1000);
  });

  it("parses minutes", () => {
    expect(ttlToMs("15m")).toBe(15 * 60 * 1000);
  });

  it("parses hours", () => {
    expect(ttlToMs("2h")).toBe(2 * 60 * 60 * 1000);
  });

  it("parses days", () => {
    expect(ttlToMs("30d")).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("throws on an invalid format", () => {
    expect(() => ttlToMs("banana")).toThrow("Invalid TTL format: banana");
  });
});
