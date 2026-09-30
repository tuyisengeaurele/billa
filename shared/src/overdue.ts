const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight (UTC) at the start of the day the given moment falls on. */
export function startOfUtcDay(moment: Date | string | number): Date {
  return new Date(Math.floor(new Date(moment).getTime() / DAY_MS) * DAY_MS);
}

/**
 * Overdue starts the day after the due date: an invoice due on the 1st is still on time all of the 1st,
 * and is one day overdue on the 2nd. Due dates are calendar days, so the comparison is by UTC day.
 */
export function isOverdueAt(dueDate: Date | string | number, now: Date): boolean {
  return startOfUtcDay(dueDate).getTime() + DAY_MS <= now.getTime();
}

/** Whole days since the due date, once it is overdue; 0 while it is still on time. */
export function daysOverdueAt(dueDate: Date | string | number, now: Date): number {
  if (!isOverdueAt(dueDate, now)) return 0;
  return Math.floor((now.getTime() - startOfUtcDay(dueDate).getTime()) / DAY_MS);
}
