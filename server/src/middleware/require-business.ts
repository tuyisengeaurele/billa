import type { NextFunction, Request, Response } from "express";

// An admin-only account (never given a business of its own) carries an empty
// businessId in its session - see auth.ts's /session handler. That's fine for
// /admin/* routes, which never touch business data, but every business-scoped
// router (documents, customers, items, business settings, search, dashboard,
// reports, export, receivables) needs a real one. Guarding here, once per
// router, means every handler downstream can keep trusting req.auth!.businessId
// is a real id, instead of every single one re-checking it itself.
export function requireBusinessContext(req: Request, res: Response, next: NextFunction) {
  if (!req.auth?.businessId) {
    res.status(403).json({ error: "no_business_access" });
    return;
  }
  next();
}
