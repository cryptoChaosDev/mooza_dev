import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { z } from "zod";
import multer from "multer";
import { Buffer } from "buffer";

const prisma = new PrismaClient();
export const router = Router();

const env = { JWT_SECRET: process.env.JWT_SECRET || "dev-secret" };

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
    fileSize: 15 * 1024 * 1024, // 15 MB
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

const profileSchema = z.object({
  firstName: z.string().min(1).transform(s => s.trim()),
  lastName: z.string().min(1).transform(s => s.trim()),
  avatarUrl: z.string().url().nullable().optional().or(z.literal("")),
  bio: z.string().optional().default("").transform(s => s.trim()),
  workPlace: z.string().optional().default("").transform(s => s.trim()),
  skills: z.array(z.string()).default([]).transform(arr => arr.map(s => s.trim()).filter(Boolean)),
  interests: z.array(z.string()).default([]).transform(arr => arr.map(s => s.trim()).filter(Boolean)),
  portfolio: z.object({
    text: z.string().optional().default("").transform(s => s.trim()),
    fileName: z.string().optional(),
    fileUrl: z.string().optional(),
  }).nullable().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  city: z.string().optional().default("").transform(s => s.trim()),
  country: z.string().optional().default("").transform(s => s.trim()),
});

// Эндпоинт для загрузки файла портфолио
router.post("/me/portfolio-file", upload.single('file'), async (req, res) => {
  try {
    const userId = authUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Файл не предоставлен" });

    const profile = await prisma.profile.update({
      where: { userId },
      // cast to any to allow writing raw binary fields added to schema
      data: ({
        portfolioFile: Buffer.from(file.buffer),
        portfolioFileName: file.originalname,
        portfolioFileType: file.mimetype
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
  
  const parse = profileSchema.safeParse(req.body);
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


