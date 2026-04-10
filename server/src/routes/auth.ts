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

// ─── Long-polling loop (no webhook needed) ───────────────────────────────────
let tgOffset = 0;

function tgApi(method: string, params: Record<string, any> = {}): Promise<any> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString();
  const url = `https://api.telegram.org/bot${botToken}/${method}?${query}`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('error', reject);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (err) { reject(new Error(`Parse error: ${data.slice(0, 100)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(35000, () => { req.destroy(new Error('Request timeout')); });
  });
}

async function tgPollLoop() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!botToken) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN is not set — bot polling disabled');
    return;
  }

  // Delete webhook so getUpdates works
  try {
    const del = await tgApi('deleteWebhook', { drop_pending_updates: 'true' });
    console.log('[Telegram] Webhook deleted, starting long-poll loop. Result:', del?.ok);
  } catch (e: any) {
    console.error('[Telegram] deleteWebhook failed:', e?.message || e);
  }

  let failCount = 0;
  while (true) {
    try {
      // timeout=20 — shorter than 30 to avoid NAT/firewall drops on idle connections
      const res = await tgApi('getUpdates', { offset: tgOffset, timeout: '20', allowed_updates: '["message"]' });
      if (!res.ok || !Array.isArray(res.result)) {
        console.warn('[Telegram] getUpdates not ok:', JSON.stringify(res).slice(0, 200));
        failCount++;
        await new Promise(r => setTimeout(r, Math.min(5000 * failCount, 30000)));
        continue;
      }
      failCount = 0;
      for (const update of res.result) {
        tgOffset = update.update_id + 1;
        const msg = update.message;
        const text: string = msg?.text || '';
        const from = msg?.from;
        if (!from) continue;

        // Respond to bare /start (user testing the bot)
        if (text === '/start') {
          try {
            await tgApi('sendMessage', {
              chat_id: String(from.id),
              text: '👋 Привет! Чтобы войти в Moooza, нажмите кнопку «Войти через Telegram» на сайте — она откроет эту беседу с нужной ссылкой.',
            });
          } catch {}
          continue;
        }

        if (!text.startsWith('/start ')) continue;

        const token = text.slice(7).trim();
        if (!tgPending.has(token)) continue;

        // Send confirmation to user
        try {
          await tgApi('sendMessage', {
            chat_id: String(from.id),
            text: '✅ Авторизация подтверждена! Вернитесь на сайт.',
          });
        } catch {}

        tgPending.set(token, {
          telegramId: String(from.id),
          firstName: from.first_name || '',
          lastName: from.last_name || '',
          username: from.username,
          photoUrl: undefined,
          resolvedAt: Date.now(),
        });
        console.log(`[Telegram] Auth token confirmed for user ${from.id}`);
      }
    } catch (e: any) {
      failCount++;
      console.error('[Telegram] Poll error #' + failCount + ':', e?.message || e);
      await new Promise(r => setTimeout(r, Math.min(5000 * failCount, 30000)));
    }
  }
}

// Start polling after 2s
setTimeout(() => tgPollLoop().catch(console.error), 2000);

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

    // Check if blocked
    if ((user as any).isBlocked) {
      return res.status(403).json({ error: 'Аккаунт заблокирован. Обратитесь в поддержку.' });
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

export default router;
