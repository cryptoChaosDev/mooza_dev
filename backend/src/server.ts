import express from "express";
import cors from "cors";
import morgan from "morgan";
import { createServer } from "http";

const app = express();

app.use(cors({
  origin: process.env.NODE_ENV === "production" 
    ? ["https://mooza-music.vercel.app", "http://147.45.166.246"] 
    : ["http://localhost:3000", "http://localhost:4000"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Authorization"],
  maxAge: 86400, // 24 hours
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Add security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, uptimeSec: process.uptime() });
});

// Import routers
import { router as authRouter } from "./routes/auth";
import { router as categoriesRouter } from "./routes/categories";
import { router as profileRouter } from "./routes/profile";
import { router as friendshipsRouter } from "./routes/friendships";

app.use("/auth", authRouter);
app.use("/categories", categoriesRouter);
app.use("/profile", profileRouter);
app.use("/friendships", friendshipsRouter);

export default app;