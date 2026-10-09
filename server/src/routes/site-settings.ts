import { Router } from 'express';
import { prisma } from '../index';

const router = Router();

const DEFAULTS: Record<string, string> = {
  loginEnabled: 'true',
  registrationEnabled: 'true',
  // When registration is closed, still allow sign-ups via a valid referral link.
  referralRegistrationEnabled: 'false',
  // Гостевой режим («Moooza без регистрации»). Аварийный выключатель: пока 'false',
  // эндпоинты, которые до фичи требовали входа (каталог людей, пост по id),
  // отвечают гостю 401, а клиент не показывает гостевые маршруты.
  guestBrowsingEnabled: 'false',
};

// Только эти ключи можно менять через PUT /api/admin/site-settings и только
// они отдаются в GET /api/site-settings.
export const ALLOWED_SITE_SETTING_KEYS = Object.keys(DEFAULTS);

// Короткий кэш флагов: guestBrowsingEnabled проверяется на каждом гостевом
// запросе — без кэша это лишний SELECT на каждый GET.
const SETTINGS_CACHE_TTL_MS = 15 * 1000;
let settingsCache: { at: number; value: Record<string, string> } | null = null;

export function clearSiteSettingsCache() {
  settingsCache = null;
}

// Ensure defaults exist, return as plain object
async function getSettings(): Promise<Record<string, string>> {
  const rows = await prisma.siteSetting.findMany();
  const result: Record<string, string> = { ...DEFAULTS };
  for (const row of rows) {
    if (ALLOWED_SITE_SETTING_KEYS.includes(row.key)) result[row.key] = row.value;
  }
  return result;
}

async function getSettingsCached(): Promise<Record<string, string>> {
  const now = Date.now();
  if (settingsCache && now - settingsCache.at < SETTINGS_CACHE_TTL_MS) return settingsCache.value;
  const value = await getSettings();
  settingsCache = { at: now, value };
  return value;
}

/** Включён ли гостевой режим (SiteSetting.guestBrowsingEnabled === 'true'). */
export async function isGuestBrowsingEnabled(): Promise<boolean> {
  try {
    const s = await getSettingsCached();
    return s.guestBrowsingEnabled === 'true';
  } catch {
    return false; // при сбое БД — безопасное значение: гостевой режим выключен
  }
}

// GET /api/site-settings — public
router.get('/', async (_req, res) => {
  try {
    res.json(await getSettings());
  } catch (error) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

/**
 * Валидирует тело PUT /api/admin/site-settings: только ключи из allowlist,
 * значения — 'true' | 'false' (boolean приводится к строке).
 * Возвращает нормализованные обновления или текст ошибки.
 */
export function sanitizeSiteSettingsUpdate(body: unknown): { updates: Record<string, string> } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Ожидается объект настроек' };
  const updates: Record<string, string> = {};
  for (const [key, raw] of Object.entries(body as Record<string, unknown>)) {
    if (!ALLOWED_SITE_SETTING_KEYS.includes(key)) return { error: `Неизвестная настройка: ${key}` };
    const value = typeof raw === 'boolean' ? String(raw) : raw;
    if (value !== 'true' && value !== 'false') return { error: `Недопустимое значение для ${key}` };
    updates[key] = value;
  }
  if (Object.keys(updates).length === 0) return { error: 'Нет настроек для обновления' };
  return { updates };
}

// PUT /api/site-settings — admin only (called via admin routes)
export async function updateSiteSettings(updates: Record<string, string>) {
  for (const [key, value] of Object.entries(updates)) {
    await prisma.siteSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
  clearSiteSettingsCache();
}

export default router;
