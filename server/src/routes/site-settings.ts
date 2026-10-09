import { Router } from 'express';
import { prisma } from '../index';
import { seoIndexable } from '../seo/config';

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
  // Автопостинг новых заказов/вакансий в Telegram-канал (lib/jobsChannel). Включает
  // админ после создания канала; без env TELEGRAM_JOBS_CHANNEL_ID флаг ни на что не влияет.
  jobsChannelEnabled: 'false',
  // Временное авто-приглашение: новая заявка из листа ожидания сразу получает
  // ссылку-приглашение (lib/waitlist.maybeAutoInviteWaitlistEntry). Работает, только
  // если регистрация по приглашениям включена.
  waitlistAutoInvite: 'false',
  // Ссылка «Приложение для Android» (APK с сайта, /moooza.apk) в браузерах Android —
  // лендинг и бургер-меню. Включает админ после проверки сборки на телефоне.
  androidApkEnabled: 'false',
};

// Только эти ключи отдаются в GET /api/site-settings (менять через
// PUT /api/admin/site-settings можно только их же — allowlist SITE_SETTING_FLAGS в admin.ts).
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
// seoIndexable — вычисляемый (не из БД, менять через PUT нельзя): открытый режим
// индексации = env SEO_INDEXABLE и гостевой режим. Клиент по нему выбирает meta
// robots для /login и /register (в легаси-режиме — как сейчас, index).
router.get('/', async (_req, res) => {
  try {
    const settings = await getSettings();
    const seoIndexableNow = seoIndexable() && settings.guestBrowsingEnabled === 'true';
    res.json({ ...settings, seoIndexable: seoIndexableNow ? 'true' : 'false' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// PUT /api/site-settings — admin only (called via admin routes)
export async function updateSiteSettings(updates: Record<string, string>) {
  // Включение автопостинга в канал: запоминаем момент — публикуются только
  // заказы/вакансии, созданные/опубликованные после него (не «задним числом»).
  if (updates.jobsChannelEnabled === 'true') {
    const prev = await prisma.siteSetting.findUnique({ where: { key: 'jobsChannelEnabled' } });
    if (prev?.value !== 'true') {
      const value = new Date().toISOString();
      await prisma.siteSetting.upsert({
        where: { key: 'jobsChannelEnabledAt' },
        update: { value },
        create: { key: 'jobsChannelEnabledAt', value },
      });
    }
  }
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
