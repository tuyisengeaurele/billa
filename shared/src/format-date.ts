const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Spelled out by hand: Intl's en-GB output for September changed between ICU versions
// ("Sep" vs "Sept"), so the same date would read differently on the server and in a browser.
export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
