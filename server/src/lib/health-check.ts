// A plain boolean told an admin *that* something was down, never *why* - every
// check now reports the actual error too, so "Email: Disconnected" on the
// System Health page is something you can act on instead of a red dot and a
// trip through the server logs to find out what it even means.
export interface HealthCheckResult {
  ok: boolean;
  error: string | null;
}

export function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
