export interface RetentionWeek {
  weekIndex: number;
  retainedCount: number;
  rate: number;
}

export interface RetentionCohort {
  // The Monday of the week these businesses signed up in.
  cohortStart: string;
  cohortSize: number;
  weeks: RetentionWeek[];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Keeps the table a reasonable size for a dashboard glance, not a data dump -
// the newest 8 signup cohorts, each tracked for up to 6 weeks of engagement.
const MAX_COHORTS = 8;
const MAX_WEEKS = 6;

function mondayOf(date: Date): Date {
  const truncated = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = truncated.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  truncated.setUTCDate(truncated.getUTCDate() - daysSinceMonday);
  return truncated;
}

// Groups businesses by the week they signed up in, then for each of the weeks
// since (up to MAX_WEEKS), reports what fraction of that cohort created at least
// one document during that week - a business "came back and did something",
// the same shape as any standard weekly-cohort retention table. Only weeks that
// have actually elapsed are included, so a cohort from last week correctly shows
// one week of data instead of five weeks of misleading zeros.
export function computeRetentionCohorts(
  businesses: { id: string; createdAt: Date }[],
  documents: { businessId: string; createdAt: Date }[],
  now: Date = new Date(),
): RetentionCohort[] {
  const cohortMap = new Map<string, { id: string; createdAt: Date }[]>();
  for (const business of businesses) {
    const key = mondayOf(business.createdAt).toISOString().slice(0, 10);
    const cohort = cohortMap.get(key) ?? [];
    cohort.push(business);
    cohortMap.set(key, cohort);
  }

  const docDatesByBusiness = new Map<string, Date[]>();
  for (const doc of documents) {
    const dates = docDatesByBusiness.get(doc.businessId) ?? [];
    dates.push(doc.createdAt);
    docDatesByBusiness.set(doc.businessId, dates);
  }

  const cohortKeysOldestFirst = Array.from(cohortMap.keys()).sort();
  const recentCohortKeys = cohortKeysOldestFirst.slice(-MAX_COHORTS);

  return recentCohortKeys.map((cohortKey) => {
    const cohortBusinesses = cohortMap.get(cohortKey)!;
    const cohortStartMs = new Date(`${cohortKey}T00:00:00.000Z`).getTime();
    const weeksElapsed = Math.floor((now.getTime() - cohortStartMs) / WEEK_MS);
    const weekCount = Math.max(0, Math.min(MAX_WEEKS, weeksElapsed + 1));

    const weeks: RetentionWeek[] = [];
    for (let weekIndex = 0; weekIndex < weekCount; weekIndex++) {
      const windowStart = cohortStartMs + weekIndex * WEEK_MS;
      const windowEnd = windowStart + WEEK_MS;
      const retainedCount = cohortBusinesses.filter((business) => {
        const dates = docDatesByBusiness.get(business.id) ?? [];
        return dates.some((date) => date.getTime() >= windowStart && date.getTime() < windowEnd);
      }).length;
      weeks.push({
        weekIndex,
        retainedCount,
        rate: cohortBusinesses.length > 0 ? retainedCount / cohortBusinesses.length : 0,
      });
    }

    return { cohortStart: cohortKey, cohortSize: cohortBusinesses.length, weeks };
  });
}
