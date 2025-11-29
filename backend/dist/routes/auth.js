"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
exports.router = (0, express_1.Router)();
const env = {
    JWT_SECRET: process.env.JWT_SECRET || "dev-secret",
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1d",
};
function normalizeEmail(email) {
    return email ? email.trim().toLowerCase() : undefined;
}
function normalizePhone(phone) {
    if (!phone)
        return undefined;
    const digits = phone.replace(/\D/g, "");
    if (!digits)
        return undefined;
    // assume Russia if starts with 8 or 7; otherwise keep as international with +
    if (digits.startsWith("8"))
        return "+7" + digits.slice(1);
    if (digits.startsWith("7"))
        return "+7" + digits.slice(1);
    return "+" + digits;
}
const phoneRegex = /^\+?\d{10,15}$/;
// Enhanced register schema with stronger validation
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email().max(255),
    phone: zod_1.z.string().regex(phoneRegex, 'Некорректный телефон').max(20),
    password: zod_1.z.string().min(12).max(128), // Increased minimum password length
    name: zod_1.z.string().min(1).max(100),
});
exports.router.post("/register", async (req, res) => {
    try {
        const parse = registerSchema.safeParse(req.body);
        if (!parse.success)
            return res.status(400).json({ error: parse.error.flatten() });
        const { email: rawEmail, phone: rawPhone, password, name } = parse.data;
        const email = normalizeEmail(rawEmail);
        const phone = normalizePhone(rawPhone);
        // Check for existing user with email
        if (email) {
            const existingEmail = await prisma.user.findUnique({ where: { email } });
            if (existingEmail)
                return res.status(409).json({ error: "Email already registered" });
        }
        // Check for existing user with phone
        if (phone) {
            const existingPhone = await prisma.user.findUnique({ where: { phone } });
            if (existingPhone)
                return res.status(409).json({ error: "Phone already registered" });
        }
        // Stronger password hashing
        const saltRounds = 12;
        const passwordHash = await bcryptjs_1.default.hash(password, saltRounds);
        const user = await prisma.user.create({
            data: {
                email: email,
                phone: phone ?? undefined,
                passwordHash,
                name
            }
        });
        // Ensure an empty profile is created
        await prisma.profile.upsert({
            where: { userId: user.id },
            update: {},
            create: {
                userId: user.id,
                firstName: name.split(' ')[0] || 'User',
                lastName: name.split(' ').slice(1).join(' ') || '',
                skillsCsv: '',
                interestsCsv: ''
            },
        });
        // Generate JWT with shorter expiration and more secure options
        const token = jsonwebtoken_1.default.sign({ sub: user.id, email: user.email, phone: user.phone }, env.JWT_SECRET, {
            expiresIn: "1h", // Shorter token expiration for better security
            issuer: 'mooza-auth',
            audience: 'mooza-client'
        });
        res.status(201).json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                phone: user.phone
            }
        });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: "Registration failed" });
    }
});
// Enhanced login schema
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email().optional(),
    phone: zod_1.z.string().regex(phoneRegex, 'Некорректный телефон').optional(),
    password: zod_1.z.string().min(8).max(128),
}).refine((d) => !!d.email || !!d.phone, { message: 'Нужен email или телефон', path: ['email'] });
exports.router.post("/login", async (req, res) => {
    try {
        const parse = loginSchema.safeParse(req.body);
        if (!parse.success)
            return res.status(400).json({ error: parse.error.flatten() });
        const { email: rawEmail, phone: rawPhone, password } = parse.data;
        const email = normalizeEmail(rawEmail);
        const phone = normalizePhone(rawPhone);
        // Find user by email or phone
        const user = email
            ? await prisma.user.findUnique({ where: { email } })
            : await prisma.user.findUnique({ where: { phone: phone } });
        if (!user)
            return res.status(401).json({ error: "Invalid email or password" });
        // Verify password with timing-safe comparison
        const ok = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!ok)
            return res.status(401).json({ error: "Invalid email or password" });
        // Generate JWT with security enhancements
        const token = jsonwebtoken_1.default.sign({ sub: user.id, email: user.email, phone: user.phone }, env.JWT_SECRET, {
            expiresIn: "1h", // Shorter token expiration for better security
            issuer: 'mooza-auth',
            audience: 'mooza-client'
        });
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                phone: user.phone,
                name: user.name
            }
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: "Login failed" });
    }
});
exports.router.get("/me", async (req, res) => {
    const auth = req.header("authorization");
    if (!auth?.startsWith("Bearer "))
        return res.status(401).json({ error: "Missing token" });
    const token = auth.slice("Bearer ".length);
    try {
        // Verify JWT with issuer and audience checks
        const payload = jsonwebtoken_1.default.verify(token, env.JWT_SECRET, {
            issuer: 'mooza-auth',
            audience: 'mooza-client'
        });
        const user = await prisma.user.findUnique({ where: { id: payload.sub } });
        if (!user)
            return res.status(404).json({ error: "User not found" });
        res.json({ id: user.id, email: user.email, name: user.name, phone: user.phone });
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return res.status(401).json({ error: "Token expired" });
        }
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return res.status(401).json({ error: "Invalid token" });
        }
        console.error('Auth verification error:', error);
        res.status(401).json({ error: "Invalid token" });
    }
});
