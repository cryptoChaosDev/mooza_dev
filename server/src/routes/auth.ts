import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../index';
import { z } from 'zod';
import { authLimiter, registerLimiter, codeLimiter, lookupLimiter, tgPollLimiter } from '../middleware/rateLimiter';
import { accountBlockMessage } from '../middleware/auth';
import { generateToken } from '../utils/jwt';
import { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } from '../utils/mailer';
import { tgEvent } from '../utils/telegram';
import { applyReferralProGrants } from '../utils/pro';
import { findSelfUser } from '../utils/selfUser';
import { yoNorm } from '../utils/search';
import { disconnectUserSockets } from '../socket';
import { validateArtistInvite, acceptArtistInvite, type ArtistInviteCheck } from '../lib/artistInvites';
import { recordConsentEvent, requestMeta } from '../lib/consentEvents';
import { markWaitlistRegistered } from '../lib/waitlist';

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

// Clean up entries older than 10 minutes.
// unref(): фоновая уборка не должна держать процесс (graceful shutdown, тесты).
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of tgPending) {
    if (v.resolvedAt < cutoff) tgPending.delete(k);
  }
}, 60_000).unref();

// Drop expired pending registrations (never-completed signups) every 5 minutes.
setInterval(() => {
  prisma.pendingRegistration
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => {});
}, 5 * 60 * 1000).unref();

// ─── Webhook-based bot (Telegram pushes updates to us) ───────────────────────
// No outbound connection to Telegram needed — Telegram calls our endpoint.

const router = Router();

// Код подтверждения email живёт 15 минут после каждой отправки.
const PENDING_CODE_TTL_MS = 15 * 60 * 1000;
// Неподтверждённая регистрация живёт не дольше часа от создания: повторная
// отправка кода не продлевает её бесконечно (иначе чужой email можно было бы
// держать «занятым», перезапрашивая код раз в минуту).
const PENDING_MAX_AGE_MS = 60 * 60 * 1000;

// Редакция документов (согласие на обработку ПДн + пользовательское соглашение),
// с которой соглашаются при регистрации. Поднимать при изменении текста /privacy, /terms.
const REGISTRATION_CONSENT_VERSION = '2026-05-31';

// Хэш-пустышка: bcrypt.compare выполняется и для несуществующего email, чтобы
// время ответа /login не выдавало, зарегистрирован ли адрес.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

const LOGIN_DISABLED = { error: 'Вход временно отключён. Попробуйте позже.', code: 'LOGIN_DISABLED' };
const REGISTRATION_CLOSED = { error: 'Регистрация сейчас доступна только по приглашению', code: 'REGISTRATION_CLOSED' };

function isActivePending(p: { expiresAt: Date; createdAt: Date } | null | undefined): boolean {
  if (!p) return false;
  const now = Date.now();
  return p.expiresAt.getTime() > now && now - p.createdAt.getTime() < PENDING_MAX_AGE_MS;
}

// First zod issue as a plain string (+ field name) — the client shows it as is
// instead of a generic «Ошибка регистрации» for an array of issues.
function zodErrorBody(err: z.ZodError) {
  const first = err.errors[0];
  return { error: first?.message || 'Проверьте поля формы', field: first?.path?.[0] };
}

// Nickname uniqueness — case- and ё/е-insensitive, via the generated nicknameNorm
// column. Returns true if the nickname is already taken by another user.
async function nicknameTaken(nickname: string | null | undefined, excludeUserId?: string): Promise<boolean> {
  const norm = yoNorm(nickname ?? '');
  if (!norm) return false;
  const clash = await prisma.user.findFirst({
    where: { nicknameNorm: norm, ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}) },
    select: { id: true },
  });
  return !!clash;
}

// For social signups (VK/Telegram): use the source handle as the nickname only if
// it is free, otherwise leave it null so the unique constraint can't break signup.
async function safeNickname(candidate: string | null | undefined): Promise<string | null> {
  const v = (candidate ?? '').trim();
  if (!v) return null;
  return (await nicknameTaken(v)) ? null : v;
}

// Does the invite open a CLOSED registration? Only a real ReferralLink (single-use
// while unused, a multi-use campaign always) or an existing artist invite.
// A bare userId («легаси»-код) or a referrerId from the request body does NOT:
// the client supplies them itself and any user's id is public — that was a hole
// in the closed registration (and a self-referral path to Pro).
async function referralLinkOpensRegistration(referralCode?: string | null): Promise<boolean> {
  const code = (referralCode ?? '').trim();
  if (!code) return false;
  const link = await prisma.referralLink.findUnique({ where: { code }, select: { usedById: true, multiUse: true } });
  return !!link && (link.multiUse || !link.usedById);
}

// Artist invite (ArtistInvite.token): exists, not expired, not exhausted — the same
// check as the public preview / accept endpoints (lib/artistInvites).
// null = no token supplied.
async function checkArtistInvite(token?: string | null): Promise<ArtistInviteCheck | null> {
  const t = (token ?? '').trim();
  if (!t) return null;
  return validateArtistInvite(t);
}

// Legacy referral attribution only (no effect on the registration gate or Pro):
// keep referrerId / a bare-userId referralCode only if such a user exists —
// otherwise the FK would break account creation AFTER the code was entered.
async function resolveLegacyReferrerId(referralCode?: string | null, referrerId?: string | null): Promise<string | undefined> {
  for (const cand of [referrerId, referralCode]) {
    const id = (cand ?? '').trim();
    if (!id) continue;
    const u = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (u) return u.id;
  }
  return undefined;
}

// Registration gate. Open (default) → always allowed. Closed → allowed only when
// referral-only mode is on AND the signup carries a valid referral link / artist invite.
async function registrationAllowed(referralValid = false): Promise<boolean> {
  const [reg, refReg] = await Promise.all([
    prisma.siteSetting.findUnique({ where: { key: 'registrationEnabled' } }),
    prisma.siteSetting.findUnique({ where: { key: 'referralRegistrationEnabled' } }),
  ]);
  if (reg?.value !== 'false') return true;
  return refReg?.value === 'true' && referralValid;
}

// Global login switch (site-settings `loginEnabled`, admin panel).
async function loginEnabled(): Promise<boolean> {
  const s = await prisma.siteSetting.findUnique({ where: { key: 'loginEnabled' } });
  return s?.value !== 'false';
}

// Common check before issuing a JWT to an EXISTING user: account block and the
// global login switch (admins are never locked out, so the switch can be undone).
async function loginDenied(user: { isAdmin?: boolean | null; isBlocked?: boolean | null; blockedUntil?: Date | null }):
  Promise<{ status: number; body: Record<string, unknown> } | null> {
  const blockMsg = accountBlockMessage(user);
  if (blockMsg) return { status: 403, body: { error: blockMsg, code: 'ACCOUNT_BLOCKED' } };
  if (!user.isAdmin && !(await loginEnabled())) return { status: 403, body: LOGIN_DISABLED };
  return null;
}

// Same check as on the client email step (zod .email(): latin only, TLD of 2+ letters).
const emailField = (requiredMsg = 'Укажите email') =>
  z.string({ required_error: requiredMsg, invalid_type_error: requiredMsg })
    .trim().toLowerCase()
    .email('Некорректный email');

// Shared by /register and /reset-password — min 8 chars + a digit + a special char.
const passwordSchema = z.string({ required_error: 'Укажите пароль', invalid_type_error: 'Укажите пароль' })
  .min(8, 'Пароль — минимум 8 символов')
  .regex(/\d/, 'Пароль должен содержать цифру')
  .regex(/[^A-Za-z0-9]/, 'Пароль должен содержать спецсимвол');

// Birth date: ДД.ММ.ГГГГ or ISO (ГГГГ-ММ-ДД; a full ISO timestamp, as the client
// used to send, is accepted too). Must be a real calendar date, age 16+ (and ≤120).
// Returns the normalized ISO date 'ГГГГ-ММ-ДД' or an error text.
function parseBirthDate(raw: string): { iso: string } | { error: string; code?: string } {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let mt = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  if (mt) {
    d = +mt[1]; m = +mt[2]; y = +mt[3];
  } else if ((mt = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(s))) {
    y = +mt[1]; m = +mt[2]; d = +mt[3];
  } else {
    return { error: 'Дата рождения — в формате ДД.ММ.ГГГГ' };
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return { error: 'Некорректная дата рождения' };
  }
  const now = new Date();
  const nm = now.getUTCMonth() + 1;
  const age = now.getUTCFullYear() - y - (nm < m || (nm === m && now.getUTCDate() < d) ? 1 : 0);
  if (dt.getTime() > now.getTime() || age > 120) return { error: 'Проверьте дату рождения' };
  if (age < 16) {
    return { error: 'Для использования платформы необходимо быть старше 16 лет', code: 'AGE_TOO_YOUNG' };
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return { iso: `${y}-${pad(m)}-${pad(d)}` };
}

const registerSchema = z.object({
  // Step 1: Location
  country: z.string().optional(),
  city: z.string().optional(),
  // Step 2: Contact
  phone: z.string().optional(),
  email: emailField(),
  // Step 3: Personal
  lastName: z.string({ required_error: 'Укажите фамилию' }).trim().min(1, 'Укажите фамилию').max(30, 'Фамилия — не более 30 символов'),
  firstName: z.string({ required_error: 'Укажите имя' }).trim().min(1, 'Укажите имя').max(20, 'Имя — не более 20 символов'),
  nickname: z.string().max(20, 'Никнейм — не более 20 символов').optional(),
  // Step 4: Field of Activity
  fieldOfActivityId: z.string().optional(),
  // Step 5: Professions (multi-level) — at least one is required for new accounts
  // (Telegram/VK signups pick it later, behind the client ProfessionGate).
  userProfessions: z.array(z.object({
    professionId: z.string(),
    features: z.array(z.string()).optional(),
    selectedCustomFilterValueIds: z.array(z.string()).optional(),
  }), { required_error: 'Выберите хотя бы одну профессию' })
    .min(1, 'Выберите хотя бы одну профессию')
    .max(10, 'Не более 10 профессий'),
  // Step 6 (artistIds) intentionally NOT accepted: it used to create an ACCEPTED
  // membership in any artist at verify time — a bypass of the join approval.
  // Joining an artist goes through the artist section (request → approval) or a
  // role-bound artistInviteToken issued by the artist's admins.
  // Step 7: Password — min 8 chars and must contain a digit and a special char
  password: passwordSchema,
  // Referral
  referrerId: z.string().optional(),
  referralCode: z.string().optional(),   // ReferralLink.code, if signed up via a named link
  // Role-bound artist invite link (ArtistInvite.token) — consumed at user creation
  artistInviteToken: z.string().optional(),
  // Age verification (validated by parseBirthDate below)
  birthDate: z.string({ required_error: 'Укажите дату рождения', invalid_type_error: 'Укажите дату рождения' }),
  // Consents: PD processing (+ terms) is mandatory (152-ФЗ), marketing is optional.
  consentPd: z.literal(true, { errorMap: () => ({ message: 'Требуется согласие на обработку персональных данных' }) }),
  consentMarketing: z.boolean().optional(),
});

const loginSchema = z.object({
  email: emailField(),
  password: z.string({ required_error: 'Укажите пароль', invalid_type_error: 'Укажите пароль' }).min(1, 'Укажите пароль'),
});

// Check nickname uniqueness
router.get('/check-nickname', lookupLimiter, async (req, res) => {
  const { nickname } = req.query as { nickname: string };
  if (!nickname || nickname.trim().length < 2) return res.json({ available: false });
  res.json({ available: !(await nicknameTaken(nickname.trim())) });
});

// Check email availability (so the «уже занят» hint appears on the email step,
// not only at the end of registration). A pending, unverified registration is NOT
// «taken»: we report `pending: true` and the client offers to continue it (enter
// the code / resend — after confirming the password of that registration).
router.get('/check-email', lookupLimiter, async (req, res) => {
  const parsed = emailField().safeParse(req.query.email);
  if (!parsed.success) {
    return res.json({ available: false, valid: false, pending: false });
  }
  const email = parsed.data;
  const [user, pending] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.pendingRegistration.findUnique({ where: { email }, select: { expiresAt: true, createdAt: true } }),
  ]);
  res.json({ available: !user, valid: true, pending: !user && isActivePending(pending) });
});

// Register
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);
    const normalizedEmail = data.email; // trimmed + lowercased by the schema

    // Registration switch — closed to the public, but in referral-only mode a
    // valid ReferralLink OR an artist invite still lets people sign up.
    const artistInvite = await checkArtistInvite(data.artistInviteToken);
    const invited = (await referralLinkOpensRegistration(data.referralCode))
      || !!artistInvite?.ok;
    if (!(await registrationAllowed(invited))) {
      // Invite-only mode and the artist link has expired / run out of uses —
      // say exactly that instead of the generic «только по приглашению».
      if (artistInvite && !artistInvite.ok && artistInvite.status === 410 && (await registrationAllowed(true))) {
        return res.status(410).json({ error: artistInvite.error, code: artistInvite.code });
      }
      return res.status(403).json(REGISTRATION_CLOSED);
    }
    // Login switched off — the account couldn't be signed into after the code anyway.
    if (!(await loginEnabled())) {
      return res.status(403).json({ error: 'Вход и регистрация временно отключены. Попробуйте позже.', code: 'LOGIN_DISABLED' });
    }

    // Age validation: a real date, at least 16 (was unchecked → 500 after the code).
    const birth = parseBirthDate(data.birthDate);
    if ('error' in birth) {
      return res.status(400).json({ error: birth.error, code: birth.code, field: 'birthDate' });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует', field: 'email' });
    }

    // Check phone uniqueness if provided
    if (data.phone) {
      const existingPhone = await prisma.user.findUnique({
        where: { phone: data.phone },
        select: { id: true },
      });
      if (existingPhone) {
        return res.status(400).json({ error: 'Пользователь с таким телефоном уже существует', field: 'phone' });
      }
    }

    // Nickname uniqueness (case/ё-insensitive) if provided.
    if (data.nickname && (await nicknameTaken(data.nickname))) {
      return res.status(400).json({ error: 'Этот никнейм уже занят', field: 'nickname' });
    }

    // City must come from the catalog — drop a non-catalog value (e.g. from
    // geolocation autofill) rather than failing signup.
    if (data.city) {
      const inCatalog = await prisma.city.findFirst({
        where: { name: { equals: data.city, mode: 'insensitive' } },
        select: { id: true },
      });
      if (!inCatalog) data.city = undefined;
    }

    // Catalog references are checked NOW — an unknown id would only blow up the
    // account creation after the user has already entered the emailed code.
    const seenProf = new Set<string>();
    data.userProfessions = data.userProfessions.filter((up) => {
      if (seenProf.has(up.professionId)) return false;
      seenProf.add(up.professionId);
      return true;
    });
    const profIds = [...seenProf];
    const knownProfs = await prisma.profession.count({ where: { id: { in: profIds } } });
    if (knownProfs !== profIds.length) {
      return res.status(400).json({ error: 'Выберите профессию из списка', field: 'userProfessions' });
    }
    const filterIds = [...new Set(data.userProfessions.flatMap((up) => up.selectedCustomFilterValueIds ?? []))];
    if (filterIds.length) {
      const known = new Set((await prisma.customFilterValue.findMany({
        where: { id: { in: filterIds } }, select: { id: true },
      })).map((v) => v.id));
      for (const up of data.userProfessions) {
        if (up.selectedCustomFilterValueIds) {
          up.selectedCustomFilterValueIds = up.selectedCustomFilterValueIds.filter((id) => known.has(id));
        }
      }
    }
    if (data.fieldOfActivityId) {
      const foa = await prisma.fieldOfActivity.findUnique({ where: { id: data.fieldOfActivityId }, select: { id: true } });
      if (!foa) data.fieldOfActivityId = undefined;
    }

    // IMPORTANT: do NOT create a User (or any related record) here. The account
    // is created only after the emailed code is verified (see /verify-email).
    // We stash the signup payload in PendingRegistration until then.
    // Referral-link resolution/burning is also deferred to verification time.
    const now = new Date();
    const { password: _password, consentPd: _consentPd, consentMarketing, ...rest } = data;
    const payload = {
      ...rest,
      birthDate: birth.iso,
      referrerId: await resolveLegacyReferrerId(data.referralCode, data.referrerId),
      consentPdAt: now.toISOString(),
      consentPdVersion: REGISTRATION_CONSENT_VERSION,
      consentMarketingAt: consentMarketing ? now.toISOString() : null,
      // IP/UA момента, когда человек отметил согласия, — для журнала ConsentEvent.
      _consentMeta: requestMeta(req),
    };

    // An ACTIVE pending registration is never overwritten: otherwise anyone who
    // knows someone's email could swap the password in their unfinished signup,
    // and the mailbox owner, entering the code, created an account with the
    // attacker's password. A retry by the same person (knows that password) may
    // refresh the profile fields; the code is re-sent via /resend-verification.
    const existingPending = await prisma.pendingRegistration.findUnique({ where: { email: normalizedEmail } });
    const pendingConflict = async () => {
      const current = await prisma.pendingRegistration.findUnique({ where: { email: normalizedEmail } });
      const samePerson = !!current && (await bcrypt.compare(data.password, current.passwordHash));
      if (samePerson) {
        await prisma.pendingRegistration.update({ where: { email: normalizedEmail }, data: { payload: payload as any } });
      }
      return res.status(409).json({
        error: samePerson
          ? 'Код уже отправлен на этот email — введите его или запросите новый'
          : 'На этот email уже начата регистрация. Введите код из письма или повторите регистрацию позже',
        code: 'PENDING_EXISTS',
        canContinue: samePerson,
        email: normalizedEmail,
        field: 'email',
      });
    };
    if (isActivePending(existingPending)) return pendingConflict();

    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Generate 8-digit verification code (cryptographically secure). 8 digits
    // (~26.6 bits) keeps brute-force infeasible alongside the per-email rate limit.
    const verificationCode = String(crypto.randomInt(10000000, 100000000));
    const expires = new Date(now.getTime() + PENDING_CODE_TTL_MS);
    const fresh = {
      passwordHash: hashedPassword,
      payload: payload as any,
      code: verificationCode,
      expiresAt: expires,
      lastSentAt: now,
      createdAt: now,
    };

    if (!existingPending) {
      try {
        await prisma.pendingRegistration.create({ data: { email: normalizedEmail, ...fresh } });
      } catch (e: any) {
        if (e?.code === 'P2002') return pendingConflict(); // concurrent signup won the race
        throw e;
      }
    } else {
      // Only an EXPIRED entry may be replaced (the guard re-checks it atomically).
      const replaced = await prisma.pendingRegistration.updateMany({
        where: {
          email: normalizedEmail,
          OR: [{ expiresAt: { lte: now } }, { createdAt: { lte: new Date(now.getTime() - PENDING_MAX_AGE_MS) } }],
        },
        data: fresh,
      });
      if (replaced.count === 0) return pendingConflict();
    }

    try {
      await sendVerificationEmail(normalizedEmail, verificationCode);
    } catch (mailErr) {
      console.error('[register] Failed to send verification email:', mailErr);
    }

    res.status(201).json({ pendingVerification: true, email: normalizedEmail });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(zodErrorBody(error));
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
    const normalizedEmail = String(email).trim().toLowerCase();
    const codeStr = String(code).trim();
    const ALREADY_VERIFIED = { error: 'Email уже подтверждён. Войдите в систему.', code: 'ALREADY_VERIFIED' };

    // Only what's needed below; the response is built from SELF_USER_SELECT.
    const createdSelect = { id: true, email: true, firstName: true, lastName: true } as const;

    // ── New flow: account is created from the pending registration on success ──
    const pending = await prisma.pendingRegistration.findUnique({ where: { email: normalizedEmail } });
    if (pending) {
      if (pending.code !== codeStr) return res.status(400).json({ error: 'Неверный код', code: 'CODE_INVALID' });
      if (pending.expiresAt < new Date()) {
        return res.status(400).json({ error: 'Код истёк. Запросите новый.', code: 'CODE_EXPIRED' });
      }
      // The pending entry is kept — the code can be entered once login is back on.
      if (!(await loginEnabled())) return res.status(403).json(LOGIN_DISABLED);

      const p = pending.payload as any;

      // Final uniqueness guard — someone may have claimed the email/phone meanwhile
      // (or this is a repeated verify of an already completed registration).
      const dupeEmail = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
      if (dupeEmail) {
        await prisma.pendingRegistration.delete({ where: { email: normalizedEmail } }).catch(() => {});
        return res.status(409).json(ALREADY_VERIFIED);
      }
      if (p.phone) {
        const dupePhone = await prisma.user.findUnique({ where: { phone: p.phone }, select: { id: true } });
        if (dupePhone) return res.status(400).json({ error: 'Пользователь с таким телефоном уже существует' });
      }
      if (p.nickname && (await nicknameTaken(p.nickname))) {
        return res.status(400).json({ error: 'Этот никнейм уже занят' });
      }

      // Resolve the single-use referral link now that we actually create the account.
      let refLink: { id: string; ownerId: string; multiUse: boolean } | null = null;
      if (p.referralCode) {
        const link = await prisma.referralLink.findUnique({
          where: { code: p.referralCode },
          select: { id: true, ownerId: true, usedById: true, multiUse: true },
        });
        // Многоразовая ссылка-кампания валидна всегда и не сгорает; одноразовая — пока не использована.
        if (link && (link.multiUse || !link.usedById)) refLink = { id: link.id, ownerId: link.ownerId, multiUse: link.multiUse };
      }
      // Legacy attribution — the referrer may have been deleted since /register.
      let legacyReferrerId: string | undefined;
      if (p.referrerId) {
        const ref = await prisma.user.findUnique({ where: { id: String(p.referrerId) }, select: { id: true } });
        legacyReferrerId = ref?.id;
      }
      const toDate = (v: unknown): Date | undefined => {
        if (!v) return undefined;
        const d = new Date(v as string);
        return isNaN(d.getTime()) ? undefined : d;
      };
      const consentPdAt = toDate(p.consentPdAt);

      // Create the real account AND burn the single-use referral link atomically
      // (one $transaction): either both commit or neither does, so one link can
      // never be credited to two accounts and a failed burn can't leave a
      // dangling user. Email is already verified at this point.
      let created: { user: { id: string; email: string | null; firstName: string; lastName: string }; burnedSingleUse: boolean };
      try {
        created = await prisma.$transaction(async (tx) => {
          const newUser = await tx.user.create({
            data: {
              email: normalizedEmail,
              password: pending.passwordHash,
              firstName: p.firstName,
              lastName: p.lastName,
              nickname: p.nickname,
              phone: p.phone,
              country: p.country,
              city: p.city,
              birthDate: toDate(p.birthDate),
              fieldOfActivityId: p.fieldOfActivityId || undefined,
              referrerId: refLink?.ownerId || legacyReferrerId || undefined,
              referralLinkUsed: refLink ? p.referralCode : undefined,
              emailVerified: true,
              consentPdAt,
              consentPdVersion: consentPdAt ? (p.consentPdVersion || null) : undefined,
              consentMarketingAt: toDate(p.consentMarketingAt),
              // The PD checkbox also accepts the user agreement — don't ask again.
              termsAgreedAt: consentPdAt,
              userProfessions: p.userProfessions && p.userProfessions.length > 0
                ? { create: p.userProfessions.map((up: any) => ({
                    professionId: up.professionId,
                    features: up.features || [],
                    // Carry the profession filters chosen during registration into the
                    // profile, so the user doesn't have to re-select them.
                    selectedCustomFilterValues: {
                      connect: (up.selectedCustomFilterValueIds || []).map((id: string) => ({ id })),
                    },
                  })) }
                : undefined,
              // p.artistIds (older pending entries) is ignored on purpose — no
              // self-granted ACCEPTED memberships (see registerSchema).
            },
            select: createdSelect,
          });
          // `usedById: null` guard makes the claim atomic against a concurrent
          // signup; if the link was already taken we keep the account but strip
          // the referral credit so a single-use link is never double-counted.
          if (refLink?.multiUse) {
            // Кампания (Sound Day и т.п.) — не сжигаем, только считаем регистрации.
            await tx.referralLink.update({
              where: { id: refLink.id },
              data: { usedCount: { increment: 1 } },
            });
          } else if (refLink) {
            const burned = await tx.referralLink.updateMany({
              where: { id: refLink.id, usedById: null },
              data: { usedById: newUser.id, usedAt: new Date() },
            });
            if (burned.count === 0) {
              const stripped = await tx.user.update({
                where: { id: newUser.id },
                data: { referrerId: legacyReferrerId || null, referralLinkUsed: null },
                select: createdSelect,
              });
              return { user: stripped, burnedSingleUse: false };
            }
            return { user: newUser, burnedSingleUse: true };
          }
          return { user: newUser, burnedSingleUse: false };
        });
      } catch (e: any) {
        // Two verify requests raced (double tap) — the account already exists.
        if (e?.code === 'P2002') {
          const target = String(e?.meta?.target ?? '');
          if (target.includes('phone')) return res.status(400).json({ error: 'Пользователь с таким телефоном уже существует' });
          if (target.toLowerCase().includes('nickname')) return res.status(400).json({ error: 'Этот никнейм уже занят' });
          return res.status(409).json(ALREADY_VERIFIED);
        }
        throw e;
      }
      const user = created.user;

      // Лист ожидания: заявка, которой выдана сожжённая ссылка (или с тем же email), → «Зарегистрировался».
      await markWaitlistRegistered({ userId: user.id, email: normalizedEmail, referralLinkId: created.burnedSingleUse ? refLink?.id : null });

      // Журнал согласий (ConsentEvent), данных на форме регистрации: ПДн +
      // соглашение (обязательные) и реклама (если отмечена). Best-effort —
      // recordConsentEvent сам ловит ошибки и не ломает регистрацию.
      {
        const meta = p._consentMeta && typeof p._consentMeta === 'object' ? p._consentMeta : {};
        const fallback = requestMeta(req);
        const ip = typeof meta.ip === 'string' ? meta.ip : fallback.ip;
        const userAgent = typeof meta.userAgent === 'string' ? meta.userAgent : fallback.userAgent;
        if (consentPdAt) {
          const version = p.consentPdVersion || REGISTRATION_CONSENT_VERSION;
          await recordConsentEvent({ userId: user.id, type: 'pd', action: 'grant', version, source: 'register', ip, userAgent });
          await recordConsentEvent({ userId: user.id, type: 'terms', action: 'grant', version, source: 'register', ip, userAgent });
        }
        if (toDate(p.consentMarketingAt)) {
          await recordConsentEvent({ userId: user.id, type: 'marketing', action: 'grant', version: REGISTRATION_CONSENT_VERSION, source: 'register', ip, userAgent });
        }
      }

      // Consume a role-bound artist invite link, if one was provided at signup:
      // lib/artistInvites atomically spends one use (expiry/limit checked),
      // creates the ACCEPTED membership and notifies the artist's admins.
      // No referral bonus. The account is already created — an invite that
      // expired / ran out / was deleted meanwhile only skips the membership.
      if (p.artistInviteToken) {
        try {
          const joined = await acceptArtistInvite(p.artistInviteToken, user.id);
          if (!joined.ok) {
            console.warn(`[verify-email] artist invite not consumed (user ${user.id}): ${joined.code}`);
          }
        } catch (inviteErr) {
          console.error('[verify-email] artist invite consume failed:', inviteErr);
        }
      }

      // Referral → Pro reward: every 10 referred signups grants the referrer
      // 1 month of Pro. Only a successfully burned PERSONAL single-use link counts
      // (not campaigns, not a legacy/client-supplied referrerId).
      // Fire-and-forget; guarded so it can never break signup.
      if (refLink && !refLink.multiUse && created.burnedSingleUse) {
        applyReferralProGrants(refLink.ownerId).catch(() => {});
      }

      // Registration complete — drop the pending entry.
      await prisma.pendingRegistration.delete({ where: { email: normalizedEmail } }).catch(() => {});

      // No email / full name in the monitoring chat — event + id only.
      tgEvent.register(user.id);

      const token = generateToken({ userId: user.id });

      sendWelcomeEmail(user.email!, user.firstName, user.lastName).catch(err =>
        console.error('[verify-email] welcome email failed:', err)
      );

      return res.json({ user: await findSelfUser(user.id), token });
    }

    // ── Legacy flow: users created by the old register (pre-PendingRegistration) ──
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true, email: true, firstName: true, lastName: true, isAdmin: true, isBlocked: true, blockedUntil: true,
        emailVerified: true, emailVerificationCode: true, emailVerificationExpires: true,
      },
    });

    if (!user) return res.status(404).json({ error: 'Заявка не найдена. Зарегистрируйтесь заново.' });
    if (user.emailVerified) {
      return res.status(409).json(ALREADY_VERIFIED);
    }
    if (!user.emailVerificationCode || user.emailVerificationCode !== codeStr) {
      return res.status(400).json({ error: 'Неверный код', code: 'CODE_INVALID' });
    }
    if (user.emailVerificationExpires && user.emailVerificationExpires < new Date()) {
      return res.status(400).json({ error: 'Код истёк. Запросите новый.', code: 'CODE_EXPIRED' });
    }
    const denied = await loginDenied(user);
    if (denied) return res.status(denied.status).json(denied.body);

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerificationCode: null, emailVerificationExpires: null },
    });

    const token = generateToken({ userId: user.id });

    sendWelcomeEmail(user.email!, user.firstName, user.lastName).catch(err =>
      console.error('[verify-email] welcome email failed:', err)
    );

    return res.json({ user: await findSelfUser(user.id), token });
  } catch (err) {
    console.error('[verify-email]', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── POST /auth/resend-verification ────────────────────────────────────────────
// Optional `password`: continuing a pending registration from the email step
// («на этот email уже начата регистрация»). The client is let through to the code
// screen only if it matches the password of that registration — otherwise a
// stranger could finish someone else's signup with a password they don't know.
router.post('/resend-verification', registerLimiter, async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password?: string };
    if (!email) return res.status(400).json({ error: 'email обязателен' });
    const normalizedEmail = String(email).trim().toLowerCase();

    const code = String(crypto.randomInt(10000000, 100000000));
    const expires = new Date(Date.now() + PENDING_CODE_TTL_MS);

    // ── New flow: resend code for a pending registration ──
    const pending = await prisma.pendingRegistration.findUnique({ where: { email: normalizedEmail } });
    if (pending) {
      if (password !== undefined) {
        const ok = typeof password === 'string' && (await bcrypt.compare(password, pending.passwordHash));
        if (!ok) {
          return res.status(400).json({
            error: 'Регистрация на этот email начата с другим паролем. Введите тот же пароль или повторите регистрацию позже.',
            code: 'PENDING_PASSWORD_MISMATCH',
          });
        }
      }
      // Hard cap on the lifetime of an unverified registration.
      if (Date.now() - pending.createdAt.getTime() >= PENDING_MAX_AGE_MS) {
        await prisma.pendingRegistration.delete({ where: { email: normalizedEmail } }).catch(() => {});
        return res.status(410).json({ error: 'Заявка на регистрацию устарела. Зарегистрируйтесь заново.', code: 'PENDING_EXPIRED' });
      }
      // Server-side cooldown: 60 seconds between resends
      if (pending.lastSentAt && Date.now() - pending.lastSentAt.getTime() < 60_000) {
        return res.status(429).json({ error: 'Подождите перед повторной отправкой кода.', code: 'RESEND_COOLDOWN' });
      }
      await prisma.pendingRegistration.update({
        where: { email: normalizedEmail },
        data: { code, expiresAt: expires, lastSentAt: new Date() },
      });
      await sendVerificationEmail(normalizedEmail, code);
      return res.json({ ok: true });
    }

    // ── Legacy flow: unverified user from the old register ──
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) return res.status(404).json({ error: 'Заявка не найдена. Зарегистрируйтесь заново.', code: 'PENDING_NOT_FOUND' });
    if (user.emailVerified) return res.status(409).json({ error: 'Email уже подтверждён. Войдите в систему.', code: 'ALREADY_VERIFIED' });

    if (user.lastCodeSentAt && Date.now() - user.lastCodeSentAt.getTime() < 60_000) {
      return res.status(429).json({ error: 'Подождите перед повторной отправкой кода.', code: 'RESEND_COOLDOWN' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationCode: code, emailVerificationExpires: expires, lastCodeSentAt: new Date() },
    });

    await sendVerificationEmail(normalizedEmail, code);
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

    // Find user — email is stored lowercase (the schema normalizes the input), so
    // an uppercase letter can't make a valid account look non-existent.
    // Only the fields the checks need; the response is built from SELF_USER_SELECT.
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      select: {
        id: true, email: true, password: true, isAdmin: true, isBlocked: true, blockedUntil: true,
        emailVerified: true, emailVerificationCode: true,
      },
    });

    // One answer for «no such email», «wrong password» and «no password set
    // (Telegram/VK account)» — distinct messages let anyone enumerate registered
    // addresses. bcrypt runs in every branch so timing doesn't tell either.
    const validPassword = await bcrypt.compare(data.password, user?.password || DUMMY_PASSWORD_HASH);
    if (!user || !user.password || !validPassword) {
      return res.status(401).json({ error: 'Неверный email или пароль', code: 'INVALID_CREDENTIALS' });
    }

    // Everything below is revealed only to someone who knows the password:
    // block status, the global login switch, email verification state.
    const denied = await loginDenied(user);
    if (denied) return res.status(denied.status).json(denied.body);

    // Block login if email not verified AND a verification code exists (i.e. went through new registration flow)
    if (!user.emailVerified && user.emailVerificationCode) {
      return res.status(403).json({ error: 'EMAIL_NOT_VERIFIED', email: user.email });
    }

    // Generate token
    const token = generateToken({ userId: user.id });

    // No email / full name in the monitoring chat — event + id only.
    tgEvent.login(user.id);
    res.json({ user: await findSelfUser(user.id), token });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(zodErrorBody(error));
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

// ─── 1. Generate deep-link token ─────────────────────────────────────────────
router.post('/telegram/token', authLimiter, async (req, res) => {
  const token = crypto.randomBytes(12).toString('hex'); // 24-char hex
  // Reserve slot (resolved = 0 means pending)
  tgPending.set(token, { telegramId: '', firstName: '', lastName: '', resolvedAt: Date.now() });
  // Deep-link сразу с ссылкой на бота — клиенту не нужно знать username
  let url: string | null = null;
  try {
    const { getBotUsername } = await import('../utils/telegramNotify');
    const bot = await getBotUsername();
    if (bot) url = `https://t.me/${bot}?start=${token}`;
  } catch { /* бот недоступен — клиент покажет ошибку */ }
  res.json({ token, url });
});

// ─── 2. Poll endpoint — frontend calls every 2s ───────────────────────────────
// Own soft limiter — polling must not eat the shared authLimiter (password login → 429).
router.get('/telegram/poll/:token', tgPollLimiter, async (req, res) => {
  const entry = tgPending.get(req.params.token);
  if (!entry) return res.status(404).json({ error: 'Токен не найден или истёк' });
  if (!entry.telegramId) return res.status(202).json({ status: 'pending' });

  // Confirmed — create/update user and return JWT
  try {
    let user = await prisma.user.findUnique({ where: { telegramId: entry.telegramId } });
    if (!user) {
      if (!(await registrationAllowed())) {
        tgPending.delete(req.params.token);
        return res.status(403).json(REGISTRATION_CLOSED);
      }
      if (!(await loginEnabled())) {
        tgPending.delete(req.params.token);
        return res.status(403).json(LOGIN_DISABLED);
      }
      user = await prisma.user.create({
        data: {
          telegramId: entry.telegramId,
          telegramUsername: entry.username || null,
          firstName: entry.firstName || 'Пользователь',
          lastName: entry.lastName || '',
          nickname: await safeNickname(entry.username),
          avatar: entry.photoUrl || null,
        },
      });
    } else {
      const denied = await loginDenied(user);
      if (denied) {
        tgPending.delete(req.params.token);
        return res.status(denied.status).json(denied.body);
      }
      user = await prisma.user.update({
        where: { telegramId: entry.telegramId },
        data: { telegramUsername: entry.username || user.telegramUsername },
      });
    }
    tgPending.delete(req.params.token);
    const token = generateToken({ userId: user.id });
    res.json({ status: 'ok', user: await findSelfUser(user.id), token });
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

    const { resolveNotifySubscribe, disableNotifyByTelegramId, sendBotMessage } = await import('../utils/telegramNotify');
    const chatId = String(msg.chat?.id ?? from.id);

    // Подписка на дублирование уведомлений: t.me/<bot>?start=notify_<token>
    // (проверяем ДО auth-ветки — иначе notify_-токен уйдёт в tgPending и потеряется)
    if (text.startsWith('/start notify_')) {
      const token = text.slice('/start notify_'.length).trim();
      const r = await resolveNotifySubscribe(token, String(from.id), from.username);
      if (r.ok) {
        await sendBotMessage(chatId,
          '🔔 <b>Уведомления Moooza подключены!</b>\nВсе уведомления из колокольчика будут дублироваться сюда.\n\nОтписаться: команда /stop или кнопка «Отписаться» в самом колокольчике.');
        console.log(`[Telegram] Webhook: notifications enabled for tg ${from.id}`);
      } else if (r.reason === 'conflict') {
        await sendBotMessage(chatId,
          `⚠️ Этот Telegram уже привязан к аккаунту Moooza${r.ownerName ? ` <b>${r.ownerName}</b>` : ''}. Войдите в него и подпишитесь там — или продолжайте с текущего аккаунта, привязав другой Telegram.`);
      } else {
        await sendBotMessage(chatId,
          '⏳ Ссылка устарела. Откройте колокольчик в Moooza и нажмите «Подписаться» ещё раз.');
      }
      return;
    }

    if (text === '/stop') {
      const disabled = await disableNotifyByTelegramId(String(from.id));
      await sendBotMessage(chatId, disabled
        ? '🔕 Уведомления отключены. Включить снова можно в колокольчике Moooza.'
        : 'Уведомления и так не были подключены. Подписаться можно в колокольчике Moooza.');
      return;
    }

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
      await sendBotMessage(chatId, '✅ Вход подтверждён — вернитесь на сайт Moooza, вы уже входите.');
      return;
    }

    // Любое другое сообщение боту — короткая справка
    if (text === '/start' || text === '/help') {
      await sendBotMessage(chatId,
        '👋 Это бот Moooza. Он присылает ваши уведомления с платформы.\nПодключение — через кнопку «Подписаться на уведомления в Telegram» в колокольчике на moooza.ru.\nОтключить: /stop');
    }
  } catch (e) {
    console.error('[Telegram] Webhook error:', e);
  }
});

// ─── 4. Telegram Mini App — initData auth ────────────────────────────────────
router.post('/telegram/miniapp', authLimiter, async (req, res) => {
  try {
    const { initData } = req.body as { initData: string };
    if (!initData) return res.status(400).json({ error: 'No initData' });

    const botToken = process.env.TELEGRAM_MINIAPP_BOT_TOKEN || '';
    if (!botToken) return res.status(500).json({ error: 'Mini App bot not configured' });

    // Validate initData signature (HMAC-SHA256)
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return res.status(400).json({ error: 'No hash in initData' });

    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (computedHash !== hash) return res.status(401).json({ error: 'Invalid initData' });

    // Check auth_date freshness (24h)
    const authDate = Number(params.get('auth_date') || 0);
    if (Date.now() / 1000 - authDate > 86400) {
      return res.status(401).json({ error: 'initData expired' });
    }

    // Parse user from initData
    const userJson = params.get('user');
    if (!userJson) return res.status(400).json({ error: 'No user in initData' });
    const tgUser = JSON.parse(userJson) as {
      id: number; first_name: string; last_name?: string; username?: string; photo_url?: string;
    };
    const telegramId = String(tgUser.id);

    // Find or create user
    let user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      if (!(await registrationAllowed())) {
        return res.status(403).json(REGISTRATION_CLOSED);
      }
      if (!(await loginEnabled())) return res.status(403).json(LOGIN_DISABLED);
      user = await prisma.user.create({
        data: {
          telegramId,
          telegramUsername: tgUser.username || null,
          firstName: tgUser.first_name || 'Пользователь',
          lastName: tgUser.last_name || '',
          nickname: await safeNickname(tgUser.username),
          avatar: tgUser.photo_url || null,
        },
      });
    } else {
      const denied = await loginDenied(user);
      if (denied) return res.status(denied.status).json(denied.body);
      user = await prisma.user.update({
        where: { telegramId },
        data: { telegramUsername: tgUser.username || user.telegramUsername },
      });
    }

    const token = generateToken({ userId: user.id });
    res.json({ user: await findSelfUser(user.id), token });
  } catch (e) {
    console.error('[TMA auth]', e);
    res.status(500).json({ error: 'Ошибка авторизации' });
  }
});

// ─── VK OAuth 2.0 (standard, oauth.vk.com) ───────────────────────────────────
const vkStateSet = new Set<string>();
setInterval(() => { if (vkStateSet.size > 1000) vkStateSet.clear(); }, 60_000).unref();

router.get('/vk/login', (req, res) => {
  const appUrl = process.env.APP_URL || 'https://moooza.ru';
  const state = crypto.randomBytes(16).toString('hex');
  vkStateSet.add(state);

  const params = new URLSearchParams({
    client_id: process.env.VK_CLIENT_ID || '',
    redirect_uri: `${appUrl}/api/auth/vk/callback`,
    response_type: 'code',
    scope: 'email',
    state,
    display: 'page',
    v: '5.131',
  });
  res.redirect(`https://oauth.vk.com/authorize?${params}`);
});

router.get('/vk/callback', async (req, res) => {
  const appUrl = process.env.APP_URL || 'https://moooza.ru';
  const { code, state, error } = req.query;

  if (error || !code || !state) {
    return res.redirect(`${appUrl}/login?vk_error=cancelled`);
  }
  if (!vkStateSet.has(state as string)) {
    return res.redirect(`${appUrl}/login?vk_error=state`);
  }
  vkStateSet.delete(state as string);

  try {
    // Exchange code for access_token
    const tokenUrl = new URLSearchParams({
      client_id: process.env.VK_CLIENT_ID || '',
      client_secret: process.env.VK_CLIENT_SECRET || '',
      redirect_uri: `${appUrl}/api/auth/vk/callback`,
      code: code as string,
    });
    const tokenRes = await fetch(`https://oauth.vk.com/access_token?${tokenUrl}`);
    const tokenData: any = await tokenRes.json();

    if (tokenData.error) {
      console.error('[VK] Token error:', tokenData);
      return res.redirect(`${appUrl}/login?vk_error=token`);
    }

    const { access_token, user_id } = tokenData;
    // Emails are stored lowercase — otherwise «Ivan@Mail.ru» never matches the account.
    const email: string | undefined = typeof tokenData.email === 'string' && tokenData.email.trim()
      ? tokenData.email.trim().toLowerCase() : undefined;

    // Get user profile
    const infoUrl = new URLSearchParams({
      user_ids: String(user_id),
      fields: 'photo_100,screen_name,first_name,last_name',
      access_token,
      v: '5.131',
    });
    const infoRes = await fetch(`https://api.vk.com/method/users.get?${infoUrl}`);
    const infoData: any = await infoRes.json();
    const vkProfile = infoData.response?.[0];

    if (!vkProfile) {
      return res.redirect(`${appUrl}/login?vk_error=userinfo`);
    }

    const vkId = String(vkProfile.id);
    let user = await prisma.user.findUnique({ where: { vkId } });
    if (!user && email) {
      user = await prisma.user.findFirst({ where: { email } }) || null;
    }
    let isNew = false;
    if (!user) {
      // Browser redirect flow — answer with a redirect, not raw JSON.
      if (!(await registrationAllowed())) return res.redirect(`${appUrl}/login?vk_error=closed`);
      if (!(await loginEnabled())) return res.redirect(`${appUrl}/login?vk_error=login_disabled`);
      user = await prisma.user.create({
        data: {
          vkId,
          firstName: vkProfile.first_name || 'Пользователь',
          lastName: vkProfile.last_name || '',
          email: email || null,
          avatar: vkProfile.photo_100 || null,
          nickname: await safeNickname(vkProfile.screen_name),
        },
      });
      isNew = true;
    } else {
      const denied = await loginDenied(user);
      if (denied) {
        return res.redirect(`${appUrl}/login?vk_error=${denied.body.code === 'ACCOUNT_BLOCKED' ? 'blocked' : 'login_disabled'}`);
      }
      if (!user.vkId) user = await prisma.user.update({ where: { id: user.id }, data: { vkId } });
    }

    const token = generateToken({ userId: user.id });
    // JWT goes in the URL fragment: it isn't sent to the server / proxy logs nor
    // leaked via Referer; the login page strips it from the address bar at once.
    res.redirect(`${appUrl}/login#vk_token=${token}${isNew ? '&is_new=1' : ''}`);
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
    // Emails are stored lowercase — otherwise «Ivan@Mail.ru» never matches the account.
    const email: string | undefined = typeof vkUser.email === 'string' && vkUser.email.trim()
      ? vkUser.email.trim().toLowerCase() : undefined;

    let user = await prisma.user.findUnique({ where: { vkId } });
    if (!user && email) user = await prisma.user.findFirst({ where: { email } }) || null;
    let isNew = false;
    if (!user) {
      if (!(await registrationAllowed())) {
        return res.status(403).json(REGISTRATION_CLOSED);
      }
      if (!(await loginEnabled())) return res.status(403).json(LOGIN_DISABLED);
      user = await prisma.user.create({
        data: {
          vkId,
          firstName: vkUser.first_name || 'Пользователь',
          lastName: vkUser.last_name || '',
          email: email || null,
          avatar: vkUser.avatar || null,
          nickname: await safeNickname(vkUser.screen_name),
        },
      });
      isNew = true;
    } else {
      const denied = await loginDenied(user);
      if (denied) return res.status(denied.status).json(denied.body);
      if (!user.vkId) user = await prisma.user.update({ where: { id: user.id }, data: { vkId } });
    }

    const token = generateToken({ userId: user.id });
    res.json({ user: await findSelfUser(user.id), token, isNew });
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
    // Emails are stored lowercase — otherwise «Ivan@Mail.ru» never matches the account.
    const email: string | undefined = typeof vkUser.email === 'string' && vkUser.email.trim()
      ? vkUser.email.trim().toLowerCase() : undefined;

    let user = await prisma.user.findUnique({ where: { vkId } });
    if (!user && email) {
      user = await prisma.user.findFirst({ where: { email } }) || null;
    }
    let isNew = false;
    if (!user) {
      if (!(await registrationAllowed())) {
        return res.status(403).json(REGISTRATION_CLOSED);
      }
      if (!(await loginEnabled())) return res.status(403).json(LOGIN_DISABLED);
      user = await prisma.user.create({
        data: {
          vkId,
          firstName: vkUser.first_name || 'Пользователь',
          lastName: vkUser.last_name || '',
          email: email || null,
          avatar: vkUser.avatar || null,
          nickname: await safeNickname(vkUser.screen_name),
        },
      });
      isNew = true;
    } else {
      const denied = await loginDenied(user);
      if (denied) return res.status(denied.status).json(denied.body);
      if (!user.vkId) user = await prisma.user.update({ where: { id: user.id }, data: { vkId } });
    }

    const token = generateToken({ userId: user.id });
    res.json({ user: await findSelfUser(user.id), token, isNew });
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

    // Verify HMAC signature. Without a bot token the key would be sha256('') —
    // public knowledge, i.e. anyone could forge a «signed» login for any telegramId.
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!botToken) {
      return res.status(503).json({ error: 'Вход через Telegram-виджет не настроен' });
    }
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
      if (!(await registrationAllowed())) {
        return res.status(403).json(REGISTRATION_CLOSED);
      }
      if (!(await loginEnabled())) return res.status(403).json(LOGIN_DISABLED);
      user = await prisma.user.create({
        data: {
          telegramId,
          telegramUsername: username || null,
          firstName: first_name || 'Пользователь',
          lastName: last_name || '',
          avatar: photo_url || null,
          nickname: await safeNickname(username),
        },
      });
    } else {
      const denied = await loginDenied(user);
      if (denied) return res.status(denied.status).json(denied.body);
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
    res.json({ user: await findSelfUser(user.id), token });
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

    const code = String(crypto.randomInt(10000000, 100000000));
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
    // Same password rules as at registration (8+ chars, a digit, a special char).
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) return res.status(400).json({ ...zodErrorBody(pw.error), field: 'password' });

    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    // Uniform response for «no such user» and «wrong code» so the endpoint
    // can't be used to tell which emails are registered (account enumeration).
    if (!user || !user.passwordResetCode || user.passwordResetCode !== String(code).trim()) {
      return res.status(400).json({ error: 'Неверный код', code: 'CODE_INVALID' });
    }
    if (user.passwordResetExpires && user.passwordResetExpires < new Date()) {
      return res.status(400).json({ error: 'Код истёк. Запросите новый.', code: 'CODE_EXPIRED' });
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

    // Old JWTs are now rejected (passwordChangedAt) — drop live sockets too.
    disconnectUserSockets(user.id, 'password_changed');
    // No email in the monitoring chat — event + id only.
    tgEvent.passwordReset(user.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[reset-password]', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
