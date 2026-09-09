import { describe, expect, it } from "vitest";
import { computeRetentionCohorts } from "./retention-cohorts.js";

// Fixed "now" so every test is deterministic regardless of when it runs.
const NOW = new Date("2026-09-09T12:00:00.000Z"); // a Wednesday
const MONDAY_THIS_WEEK = new Date("2026-09-07T00:00:00.000Z");
const MONDAY_LAST_WEEK = new Date("2026-08-31T00:00:00.000Z");
const MONDAY_TWO_WEEKS_AGO = new Date("2026-08-24T00:00:00.000Z");

function daysAfter(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("computeRetentionCohorts", () => {
  it("groups businesses signing up in the same week into one cohort", () => {
    const businesses = [
      { id: "b1", createdAt: daysAfter(MONDAY_THIS_WEEK, 0) },
      { id: "b2", createdAt: daysAfter(MONDAY_THIS_WEEK, 3) },
    ];

    const cohorts = computeRetentionCohorts(businesses, [], NOW);

    expect(cohorts).toHaveLength(1);
    expect(cohorts[0].cohortStart).toBe("2026-09-07");
    expect(cohorts[0].cohortSize).toBe(2);
  });

  it("counts a business as retained in a week only if it created a document during that week", () => {
    const businesses = [{ id: "b1", createdAt: MONDAY_TWO_WEEKS_AGO }];
    const documents = [
      // Week 0: no document. Week 1: one document. Week 2: none yet possible (not reached).
      { businessId: "b1", createdAt: daysAfter(MONDAY_TWO_WEEKS_AGO, 9) },
    ];

    const cohorts = computeRetentionCohorts(businesses, documents, NOW);

    const cohort = cohorts.find((c) => c.cohortStart === "2026-08-24")!;
    expect(cohort.weeks[0]).toEqual({ weekIndex: 0, retainedCount: 0, rate: 0 });
    expect(cohort.weeks[1]).toEqual({ weekIndex: 1, retainedCount: 1, rate: 1 });
  });

  it("only includes weeks that have actually elapsed since the cohort signed up", () => {
    const businesses = [{ id: "b1", createdAt: MONDAY_THIS_WEEK }];

    const cohorts = computeRetentionCohorts(businesses, [], NOW);

    // Signed up this week (Wednesday "now" is 2 days into week 0) - only week 0 exists yet.
    expect(cohorts[0].weeks).toHaveLength(1);
    expect(cohorts[0].weeks[0].weekIndex).toBe(0);
  });

  it("does not count a document created by a different business toward this cohort's retention", () => {
    const businesses = [{ id: "b1", createdAt: MONDAY_LAST_WEEK }];
    const documents = [{ businessId: "someone-else", createdAt: daysAfter(MONDAY_LAST_WEEK, 1) }];

    const cohorts = computeRetentionCohorts(businesses, documents, NOW);

    const cohort = cohorts.find((c) => c.cohortStart === "2026-08-31")!;
    expect(cohort.weeks[0].retainedCount).toBe(0);
  });

  it("returns an empty list when there are no businesses", () => {
    expect(computeRetentionCohorts([], [], NOW)).toEqual([]);
  });

  it("keeps only the most recent 8 cohorts", () => {
    const businesses = Array.from({ length: 12 }, (_, i) => ({
      id: `b${i}`,
      createdAt: daysAfter(MONDAY_THIS_WEEK, -7 * i),
    }));

    const cohorts = computeRetentionCohorts(businesses, [], NOW);

    expect(cohorts).toHaveLength(8);
    // Oldest-first ordering, so the very oldest signups are the ones dropped.
    expect(cohorts[cohorts.length - 1].cohortStart).toBe("2026-09-07");
  });
});
