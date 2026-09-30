import { describe, expect, it } from "vitest";
import { daysOverdueAt, isOverdueAt, startOfUtcDay } from "./overdue.js";

describe("overdue", () => {
  const due = new Date("2026-10-01T00:00:00.000Z");

  it("is not overdue at any time on the due date", () => {
    expect(isOverdueAt(due, new Date("2026-09-30T12:00:00.000Z"))).toBe(false);
    expect(isOverdueAt(due, new Date("2026-10-01T00:00:00.000Z"))).toBe(false);
    expect(isOverdueAt(due, new Date("2026-10-01T23:59:59.000Z"))).toBe(false);
  });

  it("is overdue from the start of the next day", () => {
    expect(isOverdueAt(due, new Date("2026-10-02T00:00:00.000Z"))).toBe(true);
    expect(isOverdueAt(due, new Date("2026-10-15T09:00:00.000Z"))).toBe(true);
  });

  it("counts days overdue from the day after, and is zero while on time", () => {
    expect(daysOverdueAt(due, new Date("2026-10-01T18:00:00.000Z"))).toBe(0);
    expect(daysOverdueAt(due, new Date("2026-10-02T08:00:00.000Z"))).toBe(1);
    expect(daysOverdueAt(due, new Date("2026-10-31T08:00:00.000Z"))).toBe(30);
  });

  it("reads a date string, and ignores the time of day on the due date", () => {
    expect(isOverdueAt("2026-10-01", new Date("2026-10-01T22:00:00.000Z"))).toBe(false);
    expect(isOverdueAt("2026-10-01T15:30:00.000Z", new Date("2026-10-02T00:00:00.000Z"))).toBe(true);
    expect(startOfUtcDay("2026-10-01T15:30:00.000Z").toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});
