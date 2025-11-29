"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: process.env.NODE_ENV === "production"
        ? ["https://mooza-music.vercel.app"]
        : ["http://localhost:3000", "http://localhost:4000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Authorization"],
    maxAge: 86400, // 24 hours
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use((0, morgan_1.default)(process.env.NODE_ENV === "production" ? "combined" : "dev"));
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
const auth_1 = require("./routes/auth");
const categories_1 = require("./routes/categories");
const profile_1 = require("./routes/profile");
const friendships_1 = require("./routes/friendships");
app.use("/auth", auth_1.router);
app.use("/categories", categories_1.router);
app.use("/profile", profile_1.router);
app.use("/friendships", friendships_1.router);
exports.default = app;
