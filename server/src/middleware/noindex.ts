import type { NextFunction, Request, Response } from "express";

// Everything behind sign-in, plus the private links Billa hands out (an invoice, a customer
// statement, an invite). A search engine that finds one of these must not list it, and a
// link that leaks must not turn into a public search result.
const PRIVATE_AREAS =
  /^\/(view|portal|invite|admin|public|dashboard|revenue|receivables|activity|customers|items|documents|settings|profile|notifications|onboarding)(\/|$)/;

export function isPrivateArea(path: string): boolean {
  return PRIVATE_AREAS.test(path);
}

export function noindexPrivatePages(req: Request, res: Response, next: NextFunction): void {
  if (isPrivateArea(req.path)) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  next();
}
