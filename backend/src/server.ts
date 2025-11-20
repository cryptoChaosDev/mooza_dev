import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { router as authRouter } from "./routes/auth";
import { router as categoriesRouter } from "./routes/categories";
import { router as profileRouter } from "./routes/profile";

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/health", (_req, res) => {
  res.json({ ok: true, uptimeSec: process.uptime() });
});

app.use("/auth", authRouter);
app.use("/categories", categoriesRouter);
app.use("/profile", profileRouter);

export default app;

