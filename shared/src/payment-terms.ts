export const PAYMENT_TERM_OPTIONS = [
  { days: 0, label: "Due on receipt" },
  { days: 7, label: "Net 7" },
  { days: 14, label: "Net 14" },
  { days: 30, label: "Net 30" },
  { days: 60, label: "Net 60" },
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDay(isoDate: string): number {
  return Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
}

export function addDaysToDate(isoDate: string, days: number): string {
  return new Date(parseDay(isoDate) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetweenDates(fromIso: string, toIso: string): number {
  return Math.round((parseDay(toIso) - parseDay(fromIso)) / DAY_MS);
}

/** The preset term that the gap between the two dates equals, or null for a custom gap. */
export function matchPaymentTerm(issueDate: string, dueDate: string): number | null {
  if (!issueDate || !dueDate) return null;
  const gap = daysBetweenDates(issueDate, dueDate);
  return PAYMENT_TERM_OPTIONS.find((option) => option.days === gap)?.days ?? null;
}
