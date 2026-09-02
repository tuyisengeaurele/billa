const MINUTE = 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const WEEK = DAY * 7;

/**
 * Humanized timestamp for feed-like content (notifications, activity log)
 * where "3h ago" reads faster than a full date. Falls back to a plain date
 * once something is a week or older, where the exact day matters more than
 * a rough duration. Callers should still expose the exact timestamp (e.g.
 * via a `title` attribute) since this is a lossy summary, not a replacement.
 */
export function formatRelativeTime(dateInput: string | Date, now: Date = new Date()): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);

  if (diffSeconds < MINUTE) return "Just now";
  if (diffSeconds < HOUR) return `${Math.round(diffSeconds / MINUTE)}m ago`;
  if (diffSeconds < DAY) return `${Math.round(diffSeconds / HOUR)}h ago`;
  if (diffSeconds < DAY * 2) return "Yesterday";
  if (diffSeconds < WEEK) return `${Math.round(diffSeconds / DAY)}d ago`;
  return date.toLocaleDateString();
}
