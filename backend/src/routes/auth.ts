import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
export const router = Router();

const env = {
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret",
};

function normalizeEmail(email?: string) {
  return email ? email.trim().toLowerCase() : undefined;
}

function normalizePhone(phone?: string) {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return undefined;
  // assume Russia if starts with 8 or 7; otherwise keep as international with +
  if (digits.startsWith("8")) return "+7" + digits.slice(1);
  if (digits.startsWith("7")) return "+7" + digits.slice(1);
  return "+" + digits;
}

const phoneRegex = /^\+?\d{10,15}$/;
const registerSchema = z.object({
  email: z.string().email(),
  phone: z.string().regex(phoneRegex, 'Некорректный телефон'),
  password: z.string().min(6),
  name: z.string().min(1),
});

router.post("/register", async (req, res) => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
  const { email: rawEmail, phone: rawPhone, password, name } = parse.data;
  const email = normalizeEmail(rawEmail);
  const phone = normalizePhone(rawPhone);

  if (email) {
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) return res.status(409).json({ error: "Email already registered" });
  }
  if (phone) {
    const existingPhone = await prisma.user.findUnique({ where: { phone } });
    if (existingPhone) return res.status(409).json({ error: "Phone already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email: email!, phone: phone ?? undefined, passwordHash, name } });
  // Ensure an empty profile is created
  await prisma.profile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, firstName: name.split(' ')[0] || 'User', lastName: name.split(' ').slice(1).join(' ') || '' , skillsCsv: '', interestsCsv: '' },
  });

  const token = jwt.sign({ sub: user.id, email: user.email, phone: user.phone }, env.JWT_SECRET, { expiresIn: "7d" });
  res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name, phone: user.phone } });
});

const loginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().regex(phoneRegex, 'Некорректный телефон').optional(),
  password: z.string().min(6),
}).refine((d) => !!d.email || !!d.phone, { message: 'Нужен email или телефон', path: ['email'] });

router.post("/login", async (req, res) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
  const { email: rawEmail, phone: rawPhone, password } = parse.data;
  const email = normalizeEmail(rawEmail);
  const phone = normalizePhone(rawPhone);

  const user = email
    ? await prisma.user.findUnique({ where: { email } })
    : await prisma.user.findUnique({ where: { phone: phone! } });
  if (!user) return res.status(401).json({ error: "Invalid email or password" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });

  const token = jwt.sign({ sub: user.id, email: user.email, phone: user.phone }, env.JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: user.id, email: user.email, phone: user.phone, name: user.name } });
});

router.get("/me", async (req, res) => {
  const auth = req.header("authorization");
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });
  const token = auth.slice("Bearer ".length);
  try {
  const payload = jwt.verify(token, env.JWT_SECRET) as unknown as { sub: number };
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ id: user.id, email: user.email, name: user.name, phone: user.phone });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});


