import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import https from 'https';
import { prisma } from '../index';
import { z } from 'zod';
import { authLimiter, registerLimiter } from '../middleware/rateLimiter';
import { generateToken } from '../utils/jwt';

// ─── Telegram bot-based auth (deep link + polling) ───────────────────────────
// Map: token → { telegramId, firstName, lastName, username, photoUrl, resolvedAt }
interface TgPendingEntry {
  telegramId: string;
  firstName: string;
  lastName: string;
  username?: string;
  photoUrl?: string;
  resolvedAt: number; // unix ms
}
const tgPending = new Map<string, TgPendingEntry>();

// Clean up entries older than 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of tgPending) {
    if (v.resolvedAt < cutoff) tgPending.delete(k);
  }
}, 60_000);

// Register Telegram webhook on startup
function registerTelegramWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.APP_URL || 'https://moooza.ru';
  if (!token) return;
  const webhookUrl = `${appUrl}/api/auth/telegram/webhook`;
  const url = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}&drop_pending_updates=true`;
  https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => console.log('[Telegram] Webhook registered:', data));
  }).on('error', (e) => console.error('[Telegram] Webhook registration error:', e.message));
}
setTimeout(registerTelegramWebhook, 3000);

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
router.post('/register', registerLimiter, async (req, res) => {
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
              include: { direction: { select: { id: true, name: true } } },
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
    const token = generateToken({ userId: user.id });

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
router.post('/login', authLimiter, async (req, res) => {
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
              include: { direction: { select: { id: true, name: true } } },
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
    if (!user.password) {
      return res.status(401).json({ error: 'Этот аккаунт использует вход через Telegram' });
    }
    const validPassword = await bcrypt.compare(data.password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Неверные учетные данные' });
    }

    // Generate token
    const token = generateToken({ userId: user.id });

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

// ─── 1. Generate deep-link token ─────────────────────────────────────────────
router.post('/telegram/token', authLimiter, (req, res) => {
  const token = crypto.randomBytes(12).toString('hex'); // 24-char hex
  // Reserve slot (resolved = 0 means pending)
  tgPending.set(token, { telegramId: '', firstName: '', lastName: '', resolvedAt: Date.now() });
  res.json({ token });
});

// ─── 2. Telegram webhook (called by Telegram servers) ────────────────────────
router.post('/telegram/webhook', async (req, res) => {
  try {
    res.sendStatus(200); // always respond quickly
    const update = req.body;
    const msg = update?.message;
    if (!msg) return;

    const text: string = msg.text || '';
    const from = msg.from;
    if (!from) return;

    // Handle /start <token>
    if (text.startsWith('/start ')) {
      const token = text.slice(7).trim();
      if (!tgPending.has(token)) return;

      // Send confirmation message to user
      const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
      const replyText = encodeURIComponent('✅ Авторизация подтверждена! Вернитесь на сайт.');
      https.get(
        `https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${from.id}&text=${replyText}`,
        () => {}
      );

      tgPending.set(token, {
        telegramId: String(from.id),
        firstName: from.first_name || '',
        lastName: from.last_name || '',
        username: from.username,
        photoUrl: undefined,
        resolvedAt: Date.now(),
      });
    }
  } catch (e) {
    console.error('[Telegram webhook]', e);
  }
});

// ─── 3. Poll endpoint — frontend calls every 2s ───────────────────────────────
router.get('/telegram/poll/:token', authLimiter, async (req, res) => {
  const entry = tgPending.get(req.params.token);
  if (!entry) return res.status(404).json({ error: 'Токен не найден или истёк' });
  if (!entry.telegramId) return res.status(202).json({ status: 'pending' });

  // Confirmed — create/update user and return JWT
  try {
    let user = await prisma.user.findUnique({ where: { telegramId: entry.telegramId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: entry.telegramId,
          telegramUsername: entry.username || null,
          firstName: entry.firstName || 'Пользователь',
          lastName: entry.lastName || '',
          nickname: entry.username || null,
          avatar: entry.photoUrl || null,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { telegramId: entry.telegramId },
        data: { telegramUsername: entry.username || user.telegramUsername },
      });
    }
    tgPending.delete(req.params.token);
    const token = generateToken({ userId: user.id });
    const { password: _, ...safe } = user as any;
    res.json({ status: 'ok', user: safe, token });
  } catch (e) {
    console.error('[Telegram poll]', e);
    res.status(500).json({ error: 'Ошибка авторизации' });
  }
});

// Telegram Login (widget — kept for future use)
router.post('/telegram', authLimiter, async (req, res) => {
  try {
    const { id, first_name, last_name, username, photo_url, auth_date, hash } = req.body;

    if (!id || !hash || !auth_date) {
      return res.status(400).json({ error: 'Неверные данные от Telegram' });
    }

    // Verify freshness (max 24h)
    const now = Math.floor(Date.now() / 1000);
    if (now - Number(auth_date) > 86400) {
      return res.status(400).json({ error: 'Данные Telegram устарели, попробуйте снова' });
    }

    // Verify HMAC signature
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const dataCheckArr = Object.entries({ id, first_name, last_name, username, photo_url, auth_date })
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('\n');
    const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckArr).digest('hex');

    if (expectedHash !== hash) {
      return res.status(401).json({ error: 'Неверная подпись Telegram' });
    }

    const telegramId = String(id);

    // Find or create user
    let user = await prisma.user.findUnique({ where: { telegramId } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId,
          telegramUsername: username || null,
          firstName: first_name || 'Пользователь',
          lastName: last_name || '',
          avatar: photo_url || null,
          nickname: username || null,
        },
      });
    } else {
      // Update username/avatar in case they changed
      user = await prisma.user.update({
        where: { telegramId },
        data: {
          telegramUsername: username || user.telegramUsername,
          avatar: photo_url || user.avatar,
        },
      });
    }

    const token = generateToken({ userId: user.id });
    const { password: _, ...userWithoutPassword } = user as any;
    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error('Telegram auth error:', error);
    res.status(500).json({ error: 'Ошибка авторизации через Telegram' });
  }
});

export default router;
