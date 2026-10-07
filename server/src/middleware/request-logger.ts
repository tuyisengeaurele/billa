import type { NextFunction, Request, Response } from "express";

// Pages and API calls where the address itself is the secret: anyone holding it can open that
// invoice, customer statement or invite. They must never end up in a log line.
const SECRET_PATH = /^(\/(?:view|portal|invite)\/|\/public\/(?:documents|customers)\/)[^/]+/;

/**
 * The address as it is safe to log: no query string (it can carry search terms, names or emails)
 * and the secret part of invoice, statement and invite links replaced.
 */
export function redactUrl(url: string): string {
  const path = url.split(/[?#]/)[0] ?? "";
  return path.replace(SECRET_PATH, "$1[redacted]");
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === "test") {
    next();
    return;
  }

  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    console.log(`${req.method} ${redactUrl(req.originalUrl)} ${res.statusCode} ${durationMs.toFixed(1)}ms`);
  });

  next();
}
