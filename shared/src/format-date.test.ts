import { describe, expect, it } from "vitest";
import { formatShortDate } from "./format-date.js";

describe("formatShortDate", () => {
  it("writes day, three-letter month and year", () => {
    expect(formatShortDate("2026-10-15T00:00:00.000Z")).toBe("15 Oct 2026");
  });

  it("uses Sep for September whatever the runtime's locale data says", () => {
    expect(formatShortDate("2026-09-03T00:00:00.000Z")).toBe("3 Sep 2026");
  });

  it("reads the date in UTC so the day never shifts with the timezone", () => {
    expect(formatShortDate("2026-01-01T23:30:00.000Z")).toBe("1 Jan 2026");
  });

  it("accepts a plain date string", () => {
    expect(formatShortDate("2026-12-31")).toBe("31 Dec 2026");
  });
});
