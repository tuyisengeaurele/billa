import "express-async-errors";
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
import { getStorage } from "./lib/storage.js";
import { detectAllowedImageType } from "./lib/file-sniff.js";
import { errorHandler } from "./middleware/error-handler.js";

export function createApp() {
  const app = express();

  app.use(
    helmet({
      // Uploaded logos and PDFs are served from this API to a client on a different
      // origin (separate port in dev, separate subdomain in prod) - helmet's
      // same-origin default would block the browser from loading them there.
      crossOriginResourcePolicy: { policy: "cross-origin" },
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

  app.use("/auth", authRouter);
  app.use("/business", businessRouter);
  app.use("/customers", customersRouter);
  app.use("/items", itemsRouter);
  app.use("/documents", documentsRouter);
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
  app.use("/receivables", receivablesRouter);

  Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);

  return app;
}
