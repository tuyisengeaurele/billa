import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { apiKeyAuth } from "../middleware/api-key-auth.js";
import { customersRouter } from "./customers.js";
import { itemsRouter } from "./items.js";
import { documentsRouter } from "./documents.js";

// The public API reuses the app's own routers, so a request is validated and authorized
// exactly as the app's own would be. What it exposes is an explicit allowlist, though:
// anything not listed (deleting, exports, imports, write-offs, settings) answers 404.
export const apiV1Router = Router();

const isTest = process.env.NODE_ENV === "test";

apiV1Router.use(apiKeyAuth);
apiV1Router.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: isTest ? 100000 : 120,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.apiKeyId ?? req.ip ?? "unknown",
  }),
);

interface AllowedRoute {
  method: string;
  // Matched against the path inside the mounted router, so "/" is the collection.
  path: RegExp;
}

const ID = "[A-Za-z0-9_-]+";
const COLLECTION = /^\/?$/;
const ONE = new RegExp(`^/${ID}/?$`);

function allowOnly(routes: AllowedRoute[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (routes.some((route) => route.method === req.method && route.path.test(req.path))) {
      next();
      return;
    }
    res.status(404).json({ error: "not_found" });
  };
}

apiV1Router.use(
  "/customers",
  allowOnly([
    { method: "GET", path: COLLECTION },
    { method: "POST", path: COLLECTION },
    { method: "GET", path: ONE },
    { method: "PATCH", path: ONE },
  ]),
  customersRouter,
);

apiV1Router.use(
  "/items",
  allowOnly([
    { method: "GET", path: COLLECTION },
    { method: "POST", path: COLLECTION },
    { method: "PATCH", path: ONE },
  ]),
  itemsRouter,
);

apiV1Router.use(
  "/documents",
  allowOnly([
    { method: "GET", path: COLLECTION },
    { method: "POST", path: COLLECTION },
    { method: "GET", path: ONE },
    { method: "PATCH", path: ONE },
    { method: "GET", path: new RegExp(`^/${ID}/pdf$`) },
    { method: "POST", path: new RegExp(`^/${ID}/finalize$`) },
    { method: "POST", path: new RegExp(`^/${ID}/payments$`) },
  ]),
  documentsRouter,
);

apiV1Router.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});
