import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { businessRouter } from "./routes/business.js";
import { customersRouter } from "./routes/customers.js";
import { itemsRouter } from "./routes/items.js";
import { documentsRouter } from "./routes/documents.js";
import { billingRouter } from "./routes/billing.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { businessesRouter } from "./routes/businesses.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use("/uploads", express.static(process.env.UPLOADS_DIR ?? "./uploads"));

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

  return app;
}
