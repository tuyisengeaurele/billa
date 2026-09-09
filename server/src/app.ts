import "express-async-errors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import * as Sentry from "@sentry/node";
import { authRouter } from "./routes/auth.js";
import { businessRouter } from "./routes/business.js";
import { customersRouter } from "./routes/customers.js";
import { itemsRouter } from "./routes/items.js";
import { documentsRouter } from "./routes/documents.js";
import { searchRouter } from "./routes/search.js";
import { billingRouter } from "./routes/billing.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { businessesRouter } from "./routes/businesses.js";
import { contactRouter } from "./routes/contact.js";
import { publicDocumentsRouter } from "./routes/public-documents.js";
import { publicCustomersRouter } from "./routes/public-customers.js";
import { impersonationRequestsRouter } from "./routes/impersonation-requests.js";
import { invitesRouter } from "./routes/invites.js";
import { adminRouter } from "./routes/admin.js";
import { announcementsRouter } from "./routes/announcements.js";
import { exportRouter } from "./routes/export.js";
import { reportsRouter } from "./routes/reports.js";
import { receivablesRouter } from "./routes/receivables.js";
import { profileRouter } from "./routes/profile.js";
import { notificationsRouter } from "./routes/notifications.js";
import { getStorage } from "./lib/storage.js";
import { detectAllowedImageType } from "./lib/file-sniff.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLIENT_DIST_DIR = path.resolve(__dirname, "../../client/dist");

// The built client app, served from this same process in production so the
// browser only ever talks to one origin - see client/src/lib/apiClient.ts and
// server/src/lib/cookies.ts for why: two different onrender.com subdomains are
// cross-site to a browser, and cross-site cookies get silently dropped by
// Incognito (always) and an increasing share of regular Chrome traffic (the
// ongoing third-party-cookie phase-out) - no cookie attribute fixes that, only
// actually being the same origin does. Doesn't exist in local dev (the client
// runs on its own Vite dev server there), so this stays a no-op until a real
// build has been run. clientDistDir is only ever overridden by tests.
export function createApp(clientDistDir: string = DEFAULT_CLIENT_DIST_DIR) {
  const app = express();
  const clientBuildExists = fs.existsSync(path.join(clientDistDir, "index.html"));

  // Trust one hop of proxy (the load balancer/reverse proxy every real host puts in
  // front of the app). Without this, req.ip is always the proxy's own address, which
  // would put every real visitor into the same IP-keyed rate-limit bucket once deployed.
  app.set("trust proxy", 1);

  app.use(requestLogger);
  app.use(
    helmet({
      // Uploaded logos and PDFs need to load from a different origin in local dev
      // (the client runs on its own Vite dev server there) - helmet's same-origin
      // default would block the browser from loading them. Harmless in production,
      // where client and API are the same origin anyway.
      crossOriginResourcePolicy: { policy: "cross-origin" },
      // Helmet's default Cross-Origin-Opener-Policy is "same-origin", which cuts
      // off a popup/redirect's ability to report its result back to this page -
      // exactly the mechanism Google/Firebase sign-in depends on (a popup window
      // reaching back via window.opener, and the redirect flow's own invisible
      // coordination iframe on firebaseapp.com). This page never had that header
      // at all before the client and API were merged into one process (the client
      // was a separate static site with no Helmet in front of it) - Google
      // sign-in worked then and silently stopped the moment this was added, with
      // no error anywhere to point at it: the popup/redirect just never resolves.
      crossOriginOpenerPolicy: false,
      // Helmet's default CSP (default-src 'self', no explicit connect-src) only
      // ever wrapped this API's own JSON responses before - now that this process
      // also serves the actual HTML page, that same default silently blocked the
      // page's own login: the Firebase Auth SDK's network calls (signInWithPassword
      // et al, straight to Google's identity servers, not this origin) and, for
      // "Continue with Google", the apis.google.com script it loads to run the
      // popup. Both are real dependencies of this page, not third parties to be
      // wary of - CSP is the wrong place to also be firebase's origin allowlist.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: [
            "'self'",
            "https://identitytoolkit.googleapis.com",
            "https://securetoken.googleapis.com",
            "https://www.googleapis.com",
          ],
          scriptSrc: ["'self'", "https://apis.google.com"],
          frameSrc: ["'self'", "https://accounts.google.com", "https://*.firebaseapp.com"],
          // The 2FA setup QR code is a data: URI straight from the server response,
          // not a file this page loads from anywhere.
          imgSrc: ["'self'", "data:"],
        },
      },
    }),
  );
  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());
  if (process.env.STORAGE_DRIVER === "r2") {
    app.get("/uploads/:businessId/:filename", async (req, res) => {
      const { businessId, filename } = req.params;
      if (!/^[\w-]+$/.test(businessId) || !/^[\w.-]+$/.test(filename)) {
        res.status(404).end();
        return;
      }
      try {
        const buffer = await getStorage().read(`${businessId}/${filename}`);
        const detected = await detectAllowedImageType(buffer);
        res.setHeader("Content-Type", detected?.mime ?? "application/octet-stream");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.send(buffer);
      } catch {
        res.status(404).end();
      }
    });
  } else {
    app.use("/uploads", express.static(process.env.UPLOADS_DIR ?? "./uploads"));
  }

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  if (clientBuildExists) {
    // Before every API router, not after: several client page routes share a
    // bare path with a real API route of the same name (GET /documents is both
    // "the Documents page" to a browser and "list documents" to the client's own
    // fetch calls) - an API router registered first would always win, no matter
    // what a fallback further down checked. A real browser navigation always
    // sends Accept: text/html; apiRequest()'s fetch calls never do (default */*),
    // so this never intercepts an actual API call, only page loads.
    //
    // The one exception: a PDF is also opened via a direct navigation
    // (window.open/<a href>, not fetch), which sends that same Accept header -
    // these two path shapes are the full, current list of endpoints reached that
    // way (grep client/src for window.open and API_BASE_URL if adding another).
    const DIRECT_DOWNLOAD_PATHS = [/^\/documents\/[^/]+\/pdf$/, /^\/public\/documents\/[^/]+\/pdf$/];
    // index: false - index.html is served explicitly below instead, with
    // Cache-Control: no-store. It's the one file a browser must never reuse a
    // stale copy of: it references the build's other, content-hashed asset
    // files by name, and it's what carries a fresh security header (like the
    // Content-Security-Policy right above) to an already-open tab. Those hashed
    // assets themselves are safe to let this cache normally - a new build ships
    // under new filenames, so there's nothing stale for the browser to prefer.
    app.use(express.static(clientDistDir, { index: false }));
    app.get("*", (req, res, next) => {
      const isDirectDownload = DIRECT_DOWNLOAD_PATHS.some((pattern) => pattern.test(req.path));
      if (!isDirectDownload && req.method === "GET" && req.headers.accept?.includes("text/html")) {
        res.set("Cache-Control", "no-store");
        res.sendFile(path.join(clientDistDir, "index.html"));
        return;
      }
      next();
    });
  }

  app.use("/auth", authRouter);
  app.use("/business", businessRouter);
  app.use("/customers", customersRouter);
  app.use("/items", itemsRouter);
  app.use("/documents", documentsRouter);
  app.use("/search", searchRouter);
  app.use("/billing", billingRouter);
  app.use("/dashboard", dashboardRouter);
  app.use("/businesses", businessesRouter);
  app.use("/contact", contactRouter);
  app.use("/public/documents", publicDocumentsRouter);
  app.use("/public/customers", publicCustomersRouter);
  app.use("/impersonation-requests", impersonationRequestsRouter);
  app.use("/invites", invitesRouter);
  app.use("/admin", adminRouter);
  app.use("/announcements", announcementsRouter);
  app.use("/export", exportRouter);
  app.use("/reports", reportsRouter);
  app.use("/profile", profileRouter);
  app.use("/notifications", notificationsRouter);
  app.use("/receivables", receivablesRouter);

  Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);

  return app;
}
