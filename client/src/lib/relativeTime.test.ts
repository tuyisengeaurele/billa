import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./relativeTime";

const NOW = new Date("2026-09-02T12:00:00.000Z");

describe("formatRelativeTime", () => {
  it("shows 'Just now' for a moment in the last minute", () => {
    expect(formatRelativeTime("2026-09-02T11:59:40.000Z", NOW)).toBe("Just now");
  });

  it("shows minutes ago for under an hour", () => {
    expect(formatRelativeTime("2026-09-02T11:45:00.000Z", NOW)).toBe("15m ago");
  });

  it("shows hours ago for under a day", () => {
    expect(formatRelativeTime("2026-09-02T09:00:00.000Z", NOW)).toBe("3h ago");
  });

  it("shows 'Yesterday' for exactly one day ago", () => {
    expect(formatRelativeTime("2026-09-01T12:00:00.000Z", NOW)).toBe("Yesterday");
  });

  it("shows days ago for under a week", () => {
    expect(formatRelativeTime("2026-08-28T12:00:00.000Z", NOW)).toBe("5d ago");
  });

  it("falls back to a plain date for a week or more ago", () => {
    const result = formatRelativeTime("2026-08-20T12:00:00.000Z", NOW);
    expect(result).toBe(new Date("2026-08-20T12:00:00.000Z").toLocaleDateString());
  });

  it("treats a future timestamp as 'Just now' instead of a negative duration", () => {
    expect(formatRelativeTime("2026-09-02T12:05:00.000Z", NOW)).toBe("Just now");
  });
});
