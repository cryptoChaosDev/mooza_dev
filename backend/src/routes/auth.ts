import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
export const router = Router();

const env = {
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1d",
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

// Enhanced register schema with stronger validation
const registerSchema = z.object({
  email: z.string().email().max(255),
  phone: z.string().regex(phoneRegex, 'Некорректный телефон').max(20),
  password: z.string().min(12).max(128), // Increased minimum password length
  name: z.string().min(1).max(100),
});

router.post("/register", async (req, res) => {
  try {
    const parse = registerSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const { email: rawEmail, phone: rawPhone, password, name } = parse.data;
    const email = normalizeEmail(rawEmail);
    const phone = normalizePhone(rawPhone);

    // Check for existing user with email
    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) return res.status(409).json({ error: "Email already registered" });
    }
    
    // Check for existing user with phone
    if (phone) {
      const existingPhone = await prisma.user.findUnique({ where: { phone } });
      if (existingPhone) return res.status(409).json({ error: "Phone already registered" });
    }

    // Stronger password hashing
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    const user = await prisma.user.create({ 
      data: { 
        email: email!, 
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
        lastName: name.split(' ').slice(1).join(' ') || '' , 
        skillsCsv: '', 
        interestsCsv: '' 
      },
    });

    // Generate JWT with shorter expiration and more secure options
    const token = jwt.sign(
      { sub: user.id, email: user.email, phone: user.phone }, 
      env.JWT_SECRET, 
      { 
        expiresIn: "1h", // Shorter token expiration for better security
        issuer: 'mooza-auth',
        audience: 'mooza-client'
      } as SignOptions
    );
    
    res.status(201).json({ 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        phone: user.phone 
      } 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Enhanced login schema
const loginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().regex(phoneRegex, 'Некорректный телефон').optional(),
  password: z.string().min(8).max(128),
}).refine((d) => !!d.email || !!d.phone, { message: 'Нужен email или телефон', path: ['email'] });

router.post("/login", async (req, res) => {
  try {
    const parse = loginSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const { email: rawEmail, phone: rawPhone, password } = parse.data;
    const email = normalizeEmail(rawEmail);
    const phone = normalizePhone(rawPhone);

    // Find user by email or phone
    const user = email
      ? await prisma.user.findUnique({ where: { email } })
      : await prisma.user.findUnique({ where: { phone: phone! } });
      
    if (!user) return res.status(401).json({ error: "Invalid email or password" });
    
    // Verify password with timing-safe comparison
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    // Generate JWT with security enhancements
    const token = jwt.sign(
      { sub: user.id, email: user.email, phone: user.phone }, 
      env.JWT_SECRET, 
      { 
        expiresIn: "1h", // Shorter token expiration for better security
        issuer: 'mooza-auth',
        audience: 'mooza-client'
      } as SignOptions
    );
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        phone: user.phone, 
        name: user.name 
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", async (req, res) => {
  const auth = req.header("authorization");
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });
  const token = auth.slice("Bearer ".length);
  
  try {
    // Verify JWT with issuer and audience checks
    const payload = jwt.verify(token, env.JWT_SECRET, {
      issuer: 'mooza-auth',
      audience: 'mooza-client'
    }) as unknown as { sub: number };
    
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(404).json({ error: "User not found" });
    
    res.json({ id: user.id, email: user.email, name: user.name, phone: user.phone });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: "Token expired" });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: "Invalid token" });
    }
    console.error('Auth verification error:', error);
    res.status(401).json({ error: "Invalid token" });
  }
});