import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const port = process.env.PORT ?? 4000;
app.listen(port, () => {
  console.log(`billa server listening on :${port}`);
});
