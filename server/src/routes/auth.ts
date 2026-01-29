import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';
import { z } from 'zod';

const router = Router();

const registerSchema = z.object({
  // Step 1: Location
  country: z.string().optional(),
  city: z.string().optional(),
  // Step 2: Contact
  phone: z.string().optional(),
  email: z.string().email(),
  // Step 3: Personal
  lastName: z.string().min(1),
  firstName: z.string().min(1),
  nickname: z.string().optional(),
  // Step 4: Field of Activity
  fieldOfActivityId: z.string().optional(),
  // Step 5: Professions (multi-level)
  userProfessions: z.array(z.object({
    professionId: z.string(),
    features: z.array(z.string()).optional(),
  })).optional(),
  // Step 6: Artist/Group + Employer
  artistIds: z.array(z.string()).optional(),
  employerId: z.string().optional(),
  // Step 7: Password
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Register
router.post('/register', async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    // Check phone uniqueness if provided
    if (data.phone) {
      const existingPhone = await prisma.user.findUnique({
        where: { phone: data.phone }
      });
      if (existingPhone) {
        return res.status(400).json({ error: 'Пользователь с таким телефоном уже существует' });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Create user with all fields
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        nickname: data.nickname,
        phone: data.phone,
        country: data.country,
        city: data.city,
        fieldOfActivityId: data.fieldOfActivityId || undefined,
        employerId: data.employerId || undefined,
        // Create user professions
        userProfessions: data.userProfessions && data.userProfessions.length > 0
          ? {
              create: data.userProfessions.map(up => ({
                professionId: up.professionId,
                features: up.features || [],
              })),
            }
          : undefined,
        // Create user artists
        userArtists: data.artistIds && data.artistIds.length > 0
          ? {
              create: data.artistIds.map(artistId => ({
                artistId,
              })),
            }
          : undefined,
      },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        nickname: true,
        avatar: true,
        bio: true,
        country: true,
        city: true,
        role: true,
        genres: true,
        fieldOfActivityId: true,
        fieldOfActivity: { select: { id: true, name: true } },
        userProfessions: {
          include: {
            profession: {
              include: { fieldOfActivity: { select: { id: true, name: true } } },
            },
          },
        },
        userArtists: {
          include: { artist: { select: { id: true, name: true } } },
        },
        employerId: true,
        employer: { select: { id: true, name: true, inn: true, ogrn: true } },
        createdAt: true,
      }
    });

    // Generate token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({ user, token });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        fieldOfActivity: { select: { id: true, name: true } },
        userProfessions: {
          include: {
            profession: {
              include: { fieldOfActivity: { select: { id: true, name: true } } },
            },
          },
        },
        userArtists: {
          include: { artist: { select: { id: true, name: true } } },
        },
        employer: { select: { id: true, name: true, inn: true, ogrn: true } },
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Неверные учетные данные' });
    }

    // Check password
    const validPassword = await bcrypt.compare(data.password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Неверные учетные данные' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    const { password: _, ...userWithoutPassword } = user;

    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

export default router;
