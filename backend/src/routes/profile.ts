import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { z } from "zod";
import multer from "multer";
import { Buffer } from "buffer";
import xss from "xss";

const prisma = new PrismaClient();
export const router = Router();

const env = { JWT_SECRET: process.env.JWT_SECRET || "dev-secret" };

// Sanitize user input to prevent XSS attacks
function sanitizeInput(input: string): string {
  // Allow some safe HTML for rich text content
  return xss(input, {
    whiteList: {
      br: [],
      p: [],
      strong: [],
      em: [],
      u: [],
      ol: [],
      ul: [],
      li: [],
      a: ['href', 'target'],
    },
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script']
  });
}

function authUserId(req: any): number | null {
  const auth = req.header("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
  const token = auth.slice("Bearer ".length);
  const payload = jwt.verify(token, env.JWT_SECRET) as unknown as { sub: number };
  return payload.sub;
  } catch {
    return null;
  }
}

router.get("/me", async (req, res) => {
  const userId = authUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  
  // Получаем профиль вместе с данными пользователя
  const p = await prisma.profile.findUnique({
    where: { userId },
    include: {
      user: true
    }
  });
  
  if (!p) return res.json({ profile: null });
  
  const profile = {
    ...p,
    phone: p.user.phone,
    email: p.user.email,
    skills: p.skillsCsv ? p.skillsCsv.split(',').filter(Boolean) : [],
    interests: p.interestsCsv ? p.interestsCsv.split(',').filter(Boolean) : [],
    portfolio: p.portfolioJson ? JSON.parse(p.portfolioJson) : null,
  };
  
  // Удаляем ненужные поля перед отправкой
  delete (profile as any).user;
  delete (profile as any).skillsCsv;
  delete (profile as any).interestsCsv;
  delete (profile as any).portfolioJson;
  
  res.json({ profile });
});

// Настройка multer для загрузки файлов
const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB (reduced from 15MB for better security)
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Недопустимый формат файла. Разрешены только PDF, DOC, DOCX'));
    }
  }
});

// Enhanced profile schema with stricter validation
const profileSchema = z.object({
  firstName: z.string().min(1).max(50).transform(s => s.trim()),
  lastName: z.string().min(1).max(50).transform(s => s.trim()),
  avatarUrl: z.string().url().nullable().optional().or(z.literal("")),
  bio: z.string().optional().default("").transform(s => s.trim().substring(0, 1000)),
  workPlace: z.string().optional().default("").transform(s => s.trim().substring(0, 100)),
  skills: z.array(z.string().min(1).max(50)).default([]).transform(arr => arr.map(s => s.trim()).filter(Boolean)),
  interests: z.array(z.string().min(1).max(50)).default([]).transform(arr => arr.map(s => s.trim()).filter(Boolean)),
  portfolio: z.object({
    text: z.string().optional().default("").transform(s => s.trim().substring(0, 500)),
    fileName: z.string().optional(),
    fileUrl: z.string().optional(),
  }).nullable().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  city: z.string().optional().default("").transform(s => s.trim().substring(0, 50)),
  country: z.string().optional().default("").transform(s => s.trim().substring(0, 50)),
});

// Эндпоинт для загрузки файла портфолио
router.post("/me/portfolio-file", upload.single('file'), async (req, res) => {
  try {
    const userId = authUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Файл не предоставлен" });

    // Validate file size again (extra security measure)
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "Файл слишком большой. Максимальный размер 5MB." });
    }

    const profile = await prisma.profile.update({
      where: { userId },
      // cast to any to allow writing raw binary fields added to schema
      data: ({
        portfolioFile: Buffer.from(file.buffer),
        portfolioFileName: file.originalname.substring(0, 100), // Limit filename length
        portfolioFileType: file.mimetype.substring(0, 50) // Limit mimetype length
      } as any)
    });

    res.json({ success: true, fileName: file.originalname });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: "Ошибка при загрузке файла" });
  }
});

// Эндпоинт для скачивания файла портфолио
router.get("/me/portfolio-file", async (req, res) => {
  try {
    const userId = authUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    
    const profile = await prisma.profile.findUnique({ where: { userId } });
    const profAny = profile as any;
    if (!profAny?.portfolioFile) {
      return res.status(404).json({ error: "Файл не найден" });
    }

    res.setHeader('Content-Type', profAny.portfolioFileType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(profAny.portfolioFileName || 'download')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff'); // Security header
    res.send(profAny.portfolioFile);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: "Ошибка при скачивании файла" });
  }
});

router.put("/me", async (req, res) => {
  const userId = authUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  
  // Debug incoming request
  console.log('PUT /profile/me request payload:', JSON.stringify(req.body, null, 2));
  
  // Sanitize all string inputs to prevent XSS
  const sanitizedBody = {
    ...req.body,
    firstName: req.body.firstName ? sanitizeInput(req.body.firstName) : undefined,
    lastName: req.body.lastName ? sanitizeInput(req.body.lastName) : undefined,
    bio: req.body.bio ? sanitizeInput(req.body.bio) : undefined,
    workPlace: req.body.workPlace ? sanitizeInput(req.body.workPlace) : undefined,
    city: req.body.city ? sanitizeInput(req.body.city) : undefined,
    country: req.body.country ? sanitizeInput(req.body.country) : undefined,
    portfolio: req.body.portfolio ? {
      text: req.body.portfolio.text ? sanitizeInput(req.body.portfolio.text) : undefined,
      fileName: req.body.portfolio.fileName ? sanitizeInput(req.body.portfolio.fileName) : undefined,
      fileUrl: req.body.portfolio.fileUrl
    } : undefined
  };
  
  const parse = profileSchema.safeParse(sanitizedBody);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
  const data = parse.data as any;
  
  // Debug parsed & validated data
  console.log('PUT /profile/me validated data:', JSON.stringify(data, null, 2));

  // Temporary debug log to inspect incoming payload and catch mapping issues
  try {
    console.log('PUT /profile/me payload (raw req.body):', JSON.stringify(req.body));
    console.log('PUT /profile/me parsed data:', JSON.stringify(data));
  } catch (e) {
    console.log('PUT /profile/me payload: [unable to stringify request body]');
  }

  // normalize phone similar to auth routes
  const normalizePhone = (phone?: string) => {
    if (!phone) return undefined;
    const digits = phone.replace(/\D/g, '');
    if (!digits) return undefined;
    if (digits.startsWith('8')) return '+7' + digits.slice(1);
    if (digits.startsWith('7')) return '+7' + digits.slice(1);
    return '+' + digits;
  };

  const name = `${data.firstName} ${data.lastName}`.trim();
  const normalizedPhone = normalizePhone(data.phone);

  // Update both User and Profile in a transaction
  const updatedRaw = await prisma.$transaction(async (tx) => {
    // update user (name / phone / email) if provided
    const userUpdate: any = { name };
    if (data.email) userUpdate.email = data.email;
    if (normalizedPhone) userUpdate.phone = normalizedPhone;
    await tx.user.update({ where: { id: userId }, data: userUpdate });

    // Prepare profile data (validated and transformed by zod)
    const profileData = {
      firstName: data.firstName, // Already trimmed by zod
      lastName: data.lastName,   // Already trimmed by zod
      avatarUrl: data.avatarUrl || null,
      bio: data.bio,            // Already trimmed by zod
      workPlace: data.workPlace,// Already trimmed by zod
      skillsCsv: data.skills.join(','), // Already filtered by zod
      interestsCsv: data.interests.join(','), // Already filtered by zod
      portfolioJson: data.portfolio ? JSON.stringify(data.portfolio) : null,
      city: data.city,          // Already trimmed by zod
      country: data.country,    // Already trimmed by zod
    };

    console.log('Saving profile data:', JSON.stringify(profileData, null, 2));

    const up = await tx.profile.upsert({
      where: { userId },
      update: profileData,
      create: {
        userId,
        ...profileData,
      },
    });
    return up;
  });

  const updated = {
    ...updatedRaw,
    skills: updatedRaw.skillsCsv ? updatedRaw.skillsCsv.split(',').filter(Boolean) : [],
    interests: updatedRaw.interestsCsv ? updatedRaw.interestsCsv.split(',').filter(Boolean) : [],
    portfolio: updatedRaw.portfolioJson ? JSON.parse(updatedRaw.portfolioJson) : null,
  } as any;
  res.json({ profile: updated });
});

// New endpoint to fetch all users with their profiles
router.get("/", async (req, res) => {
  try {
    // Get all users with their profiles
    const usersWithProfiles = await prisma.user.findMany({
      include: {
        profile: true
      }
    });

    // Transform the data to match the frontend UserProfile type
    const users = usersWithProfiles.map(user => {
      const profile = user.profile;
      if (!profile) return null;

      // Sanitize all text fields to prevent XSS
      const sanitizedFirstName = sanitizeInput(profile.firstName || '');
      const sanitizedLastName = sanitizeInput(profile.lastName || '');
      const sanitizedName = sanitizeInput(user.name);
      const sanitizedBio = profile.bio ? sanitizeInput(profile.bio) : '';
      const sanitizedWorkPlace = profile.workPlace ? sanitizeInput(profile.workPlace) : '';
      const sanitizedCity = profile.city ? sanitizeInput(profile.city) : '';
      const sanitizedCountry = profile.country ? sanitizeInput(profile.country) : '';

      return {
        userId: `user_${user.id}`,
        firstName: sanitizedFirstName,
        lastName: sanitizedLastName,
        name: sanitizedName,
        bio: sanitizedBio,
        workPlace: sanitizedWorkPlace,
        skills: profile.skillsCsv ? profile.skillsCsv.split(',').filter(Boolean) : [],
        interests: profile.interestsCsv ? profile.interestsCsv.split(',').filter(Boolean) : [],
        portfolio: profile.portfolioJson ? JSON.parse(profile.portfolioJson) : null,
        phone: user.phone || '',
        email: user.email || '',
        avatarUrl: profile.avatarUrl || '',
        city: sanitizedCity,
        country: sanitizedCountry,
        socials: [] // We might want to add social links to the database schema in the future
      };
    }).filter(Boolean); // Remove any null entries

    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});