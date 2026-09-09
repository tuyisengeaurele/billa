// A slow downstream dependency (an SMTP handshake to a host that never responds,
// a browser that never finishes launching) can hang far longer than its own
// library's default socket/connection timeout, especially against a silent
// network drop rather than an outright rejection. Racing it against a hard
// deadline here means a caller like /admin/system-health, which waits on several
// of these at once, always gets an answer - "didn't respond in time" is itself
// the correct, useful signal for a health check, not a reason to hang.
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
