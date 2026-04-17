import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../index';
import { z } from 'zod';
import { authLimiter, registerLimiter, codeLimiter } from '../middleware/rateLimiter';
import { generateToken } from '../utils/jwt';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/mailer';

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

// ─── Webhook-based bot (Telegram pushes updates to us) ───────────────────────
// No outbound connection to Telegram needed — Telegram calls our endpoint.

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
  // Step 7: Password
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Register
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);

    // Normalize email
    const normalizedEmail = data.email.trim().toLowerCase();

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
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
        email: normalizedEmail,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        nickname: data.nickname,
        phone: data.phone,
        country: data.country,
        city: data.city,
        fieldOfActivityId: data.fieldOfActivityId || undefined,
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
        createdAt: true,
      }
    });

    // Generate 6-digit verification code (cryptographically secure)
    const verificationCode = String(crypto.randomInt(100000, 1000000));
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationCode: verificationCode,
        emailVerificationExpires: expires,
      },
    });

    try {
      await sendVerificationEmail(normalizedEmail, verificationCode);
    } catch (mailErr) {
      console.error('[register] Failed to send verification email:', mailErr);
    }

    res.status(201).json({ pendingVerification: true, email: data.email });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

// ── POST /auth/verify-email ────────────────────────────────────────────────────
router.post('/verify-email', codeLimiter, async (req, res) => {
  try {
    const { email, code } = req.body as { email: string; code: string };
    if (!email || !code) return res.status(400).json({ error: 'email и code обязательны' });

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        fieldOfActivity: { select: { id: true, name: true } },
        userProfessions: {
          include: { profession: { include: { direction: { select: { id: true, name: true } } } } },
        },
        userArtists: { include: { artist: { select: { id: true, name: true } } } },
        employer: { select: { id: true, name: true, inn: true, ogrn: true } },
      },
    });

    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email уже подтверждён. Войдите в систему.' });
    }
    if (!user.emailVerificationCode || user.emailVerificationCode !== code) {
      return res.status(400).json({ error: 'Неверный код' });
    }
    if (user.emailVerificationExpires && user.emailVerificationExpires < new Date()) {
      return res.status(400).json({ error: 'Код истёк. Запросите новый.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerificationCode: null, emailVerificationExpires: null },
    });

    const token = generateToken({ userId: user.id });
    const { password: _, emailVerificationCode: __, emailVerificationExpires: ___, ...safe } = user as any;
    return res.json({ user: safe, token });
  } catch (err) {
    console.error('[verify-email]', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /auth/resend-verification ────────────────────────────────────────────
router.post('/resend-verification', registerLimiter, async (req, res) => {
  try {
    const { email } = req.body as { email: string };
    if (!email) return res.status(400).json({ error: 'email обязателен' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (user.emailVerified) return res.status(400).json({ error: 'Email уже подтверждён' });

    // Server-side cooldown: 60 seconds between resends
    if (user.lastCodeSentAt && Date.now() - user.lastCodeSentAt.getTime() < 60_000) {
      return res.status(429).json({ error: 'Подождите перед повторной отправкой кода.' });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationCode: code, emailVerificationExpires: expires, lastCodeSentAt: new Date() },
    });

    await sendVerificationEmail(email, code);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[resend-verification]', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
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

    // Check if blocked
    if ((user as any).isBlocked) {
      return res.status(403).json({ error: 'Аккаунт заблокирован. Обратитесь в поддержку.' });
    }

    // Block login if email not verified AND a verification code exists (i.e. went through new registration flow)
    if (!(user as any).emailVerified && (user as any).emailVerificationCode) {
      return res.status(403).json({ error: 'EMAIL_NOT_VERIFIED', email: user.email });
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

// ─── 2. Poll endpoint — frontend calls every 2s ───────────────────────────────
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

// ─── 3. Telegram webhook — Telegram pushes /start {token} updates here ───────
router.post('/telegram/webhook', async (req, res) => {
  // Verify secret token header (set when registering webhook)
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  if (!secret || req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.sendStatus(403);
  }

  res.sendStatus(200); // always respond quickly

  try {
    const update = req.body;
    const msg = update?.message;
    const text: string = msg?.text || '';
    const from = msg?.from;
    if (!from || !text) return;

    if (text.startsWith('/start ')) {
      const token = text.slice(7).trim();
      const entry = tgPending.get(token);
      if (!entry) return;

      tgPending.set(token, {
        telegramId: String(from.id),
        firstName: from.first_name || '',
        lastName: from.last_name || '',
        username: from.username,
        photoUrl: undefined,
        resolvedAt: Date.now(),
      });
      console.log(`[Telegram] Webhook: auth confirmed for user ${from.id}`);
    }
  } catch (e) {
    console.error('[Telegram] Webhook error:', e);
  }
});

// ─── VK ID OAuth 2.1 (PKCE) ───────────────────────────────────────────────────
// state → { codeVerifier, deviceId }
const vkStateMap = new Map<string, { codeVerifier: string; deviceId: string }>();
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  // Map has no timestamps — just cap size to 1000
  if (vkStateMap.size > 1000) vkStateMap.clear();
}, 60_000);

function base64url(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

router.get('/vk/login', (req, res) => {
  const appUrl = process.env.APP_URL || 'https://moooza.ru';

  // Generate PKCE
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(
    crypto.createHash('sha256').update(codeVerifier).digest()
  );
  const state = base64url(crypto.randomBytes(16));
  const deviceId = base64url(crypto.randomBytes(16));

  vkStateMap.set(state, { codeVerifier, deviceId });

  const params = new URLSearchParams({
    client_id: process.env.VK_CLIENT_ID || '',
    redirect_uri: `${appUrl}/api/auth/vk/callback`,
    response_type: 'code',
    scope: 'email',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  res.redirect(`https://id.vk.com/oauth2/auth?${params}`);
});

router.get('/vk/callback', async (req, res) => {
  const appUrl = process.env.APP_URL || 'https://moooza.ru';
  const { code, state, error, device_id } = req.query;

  if (error || !code || !state) {
    return res.redirect(`${appUrl}/login?vk_error=cancelled`);
  }

  const pending = vkStateMap.get(state as string);
  if (!pending) {
    return res.redirect(`${appUrl}/login?vk_error=state`);
  }
  vkStateMap.delete(state as string);

  try {
    // Exchange code for token
    const tokenRes = await fetch('https://id.vk.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.VK_CLIENT_ID || '',
        client_secret: process.env.VK_CLIENT_SECRET || '',
        redirect_uri: `${appUrl}/api/auth/vk/callback`,
        code: code as string,
        code_verifier: pending.codeVerifier,
        device_id: (device_id as string) || pending.deviceId,
        state: state as string,
      }),
    });
    const tokenData: any = await tokenRes.json();

    if (tokenData.error) {
      console.error('[VK ID] Token error:', tokenData);
      return res.redirect(`${appUrl}/login?vk_error=token`);
    }

    const { access_token } = tokenData;

    // Get user info
    const userRes = await fetch('https://id.vk.com/oauth2/user_info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.VK_CLIENT_ID || '',
        access_token,
      }),
    });
    const userBody: any = await userRes.json();
    const vkUser = userBody.user;

    if (!vkUser) {
      return res.redirect(`${appUrl}/login?vk_error=userinfo`);
    }

    const vkId = String(vkUser.user_id);
    const email: string | undefined = vkUser.email;

    let user = await prisma.user.findUnique({ where: { vkId } });
    if (!user && email) {
      user = await prisma.user.findFirst({ where: { email } }) || null;
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          vkId,
          firstName: vkUser.first_name || 'Пользователь',
          lastName: vkUser.last_name || '',
          email: email || null,
          avatar: vkUser.avatar || null,
          nickname: vkUser.screen_name || null,
        },
      });
    } else if (!user.vkId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { vkId } });
    }

    const token = generateToken({ userId: user.id });
    res.redirect(`${appUrl}/login?vk_token=${token}`);
  } catch (e) {
    console.error('[VK auth] Error:', e);
    res.redirect(`${appUrl}/login?vk_error=server`);
  }
});

// ─── VK ID: receive access_token from SDK, get user info, issue JWT ──────────
router.post('/vk/token', authLimiter, async (req, res) => {
  const { access_token } = req.body;
  if (!access_token) return res.status(400).json({ error: 'access_token required' });

  try {
    const userRes = await fetch('https://id.vk.com/oauth2/user_info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: String(process.env.VK_CLIENT_ID || ''),
        access_token,
      }),
    });
    const userBody: any = await userRes.json();
    const vkUser = userBody.user;
    if (!vkUser) return res.status(401).json({ error: 'Не удалось получить профиль VK' });

    const vkId = String(vkUser.user_id);
    const email: string | undefined = vkUser.email;

    let user = await prisma.user.findUnique({ where: { vkId } });
    if (!user && email) user = await prisma.user.findFirst({ where: { email } }) || null;
    if (!user) {
      user = await prisma.user.create({
        data: {
          vkId,
          firstName: vkUser.first_name || 'Пользователь',
          lastName: vkUser.last_name || '',
          email: email || null,
          avatar: vkUser.avatar || null,
          nickname: vkUser.screen_name || null,
        },
      });
    } else if (!user.vkId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { vkId } });
    }

    const token = generateToken({ userId: user.id });
    const { password: _, ...safe } = user as any;
    res.json({ user: safe, token });
  } catch (e) {
    console.error('[VK token] Error:', e);
    res.status(500).json({ error: 'Ошибка авторизации через ВКонтакте' });
  }
});

// ─── VK ID code exchange (called by frontend after SDK redirect) ──────────────
router.post('/vk/exchange', authLimiter, async (req, res) => {
  const { code, device_id, code_verifier } = req.body;
  if (!code || !device_id || !code_verifier) {
    return res.status(400).json({ error: 'Недостаточно параметров' });
  }

  const appUrl = process.env.APP_URL || 'https://moooza.ru';

  try {
    // Exchange code for token (public client — no client_secret)
    const exchangeParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: String(process.env.VK_CLIENT_ID || ''),
      redirect_uri: `${appUrl}/login`,
      code,
      code_verifier,
      device_id,
    });

    const tokenRes = await fetch('https://id.vk.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: exchangeParams,
    });
    const rawText = await tokenRes.text();

    let tokenData: any;
    try { tokenData = JSON.parse(rawText); } catch {
      return res.status(502).json({ error: 'VK вернул неожиданный ответ', raw: rawText.substring(0, 200) });
    }
    if (tokenData.error) {
      console.error('[VK exchange] token error:', tokenData);
      return res.status(401).json({ error: 'Ошибка VK: ' + (tokenData.error_description || tokenData.error) });
    }

    const { access_token } = tokenData;

    // Get user info
    const userRes = await fetch('https://id.vk.com/oauth2/user_info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: String(process.env.VK_CLIENT_ID || ''),
        access_token,
      }),
    });
    const userBody: any = await userRes.json();
    const vkUser = userBody.user;

    if (!vkUser) {
      return res.status(401).json({ error: 'Не удалось получить данные профиля VK' });
    }

    const vkId = String(vkUser.user_id);
    const email: string | undefined = vkUser.email;

    let user = await prisma.user.findUnique({ where: { vkId } });
    if (!user && email) {
      user = await prisma.user.findFirst({ where: { email } }) || null;
    }
    if (!user) {
      user = await prisma.user.create({
        data: {
          vkId,
          firstName: vkUser.first_name || 'Пользователь',
          lastName: vkUser.last_name || '',
          email: email || null,
          avatar: vkUser.avatar || null,
          nickname: vkUser.screen_name || null,
        },
      });
    } else if (!user.vkId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { vkId } });
    }

    const token = generateToken({ userId: user.id });
    const { password: _, ...safe } = user as any;
    res.json({ user: safe, token });
  } catch (e) {
    console.error('[VK exchange] Error:', e);
    res.status(500).json({ error: 'Ошибка авторизации через ВКонтакте' });
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

// ── POST /auth/forgot-password ────────────────────────────────────────────────
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body as { email: string };
    if (!email?.trim()) return res.status(400).json({ error: 'Укажите email' });

    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    // Always respond OK to prevent user enumeration
    if (!user) return res.json({ ok: true });

    // Server-side cooldown: 60 seconds between reset code sends
    if (user.lastCodeSentAt && Date.now() - user.lastCodeSentAt.getTime() < 60_000) {
      return res.json({ ok: true }); // silent — still prevent enumeration
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetCode: code, passwordResetExpires: expires, lastCodeSentAt: new Date() },
    });

    try {
      await sendPasswordResetEmail(email.trim().toLowerCase(), code);
    } catch (mailErr) {
      console.error('[forgot-password] mail error:', mailErr);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[forgot-password]', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /auth/reset-password ─────────────────────────────────────────────────
router.post('/reset-password', codeLimiter, authLimiter, async (req, res) => {
  try {
    const { email, code, password } = req.body as { email: string; code: string; password: string };
    if (!email || !code || !password) return res.status(400).json({ error: 'Все поля обязательны' });
    if (password.length < 8) return res.status(400).json({ error: 'Пароль минимум 8 символов' });

    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    if (!user.passwordResetCode || user.passwordResetCode !== code) {
      return res.status(400).json({ error: 'Неверный код' });
    }
    if (user.passwordResetExpires && user.passwordResetExpires < new Date()) {
      return res.status(400).json({ error: 'Код истёк. Запросите новый.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        passwordResetCode: null,
        passwordResetExpires: null,
        emailVerified: true,
        passwordChangedAt: new Date(),
      },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[reset-password]', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
