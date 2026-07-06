/**
 * Дублирование уведомлений колокольчика в Telegram-бот (@moooza_auth_bot).
 *
 * Поток подписки: клиент просит токен → открывает t.me/<bot>?start=notify_<token> →
 * Telegram шлёт /start notify_<token> в webhook (routes/auth.ts) → resolveNotifySubscribe()
 * привязывает telegramId и включает флаг User.telegramNotifyEnabled.
 *
 * Дублирование: Prisma-middleware в index.ts перехватывает КАЖДЫЙ notification.create
 * (их 20+ разбросанных мест) и зовёт tgNotifyFromRow() — гарантия паритета с колокольчиком.
 *
 * Отправка идёт через TELEGRAM_API_BASE (релей tg.moooza.ru — api.telegram.org
 * заблокирован из РФ), ошибки глотаются: Telegram — best-effort канал.
 */
import crypto from 'crypto';
import { prisma } from '../index';
import { escTg } from './telegram';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API_BASE = (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');
const APP_URL = (process.env.APP_URL || 'https://moooza.ru').replace(/\/+$/, '');

// ── Имя бота (для deep-link на клиенте) — getMe с кэшем ─────────────────────
let cachedBotUsername: string | null = null;
export async function getBotUsername(): Promise<string | null> {
  if (cachedBotUsername) return cachedBotUsername;
  if (!BOT_TOKEN) return null;
  try {
    const r = await fetch(`${API_BASE}/bot${BOT_TOKEN}/getMe`);
    const d: any = await r.json();
    if (d?.ok && d.result?.username) {
      cachedBotUsername = d.result.username as string;
      return cachedBotUsername;
    }
  } catch { /* relay/network down — вернём null, клиент покажет ошибку */ }
  return null;
}

// ── Токены подписки (in-memory, TTL 15 мин — как tgPending в auth) ───────────
const pending = new Map<string, { userId: string; createdAt: number }>();
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [k, v] of pending) if (v.createdAt < cutoff) pending.delete(k);
}, 60 * 1000).unref?.();

export function createNotifySubscribeToken(userId: string): string {
  const token = crypto.randomBytes(12).toString('hex'); // 24-char hex, как в auth
  pending.set(token, { userId, createdAt: Date.now() });
  return token;
}

/** Webhook получил /start notify_<token>. Привязывает telegramId и включает флаг. */
export async function resolveNotifySubscribe(
  token: string, telegramId: string, username?: string,
): Promise<{ ok: boolean; reason?: 'expired' | 'conflict' }> {
  const entry = pending.get(token);
  if (!entry) return { ok: false, reason: 'expired' };
  pending.delete(token);
  try {
    await prisma.user.update({
      where: { id: entry.userId },
      data: {
        telegramId,
        ...(username ? { telegramUsername: username } : {}),
        telegramNotifyEnabled: true,
      } as any,
    });
    return { ok: true };
  } catch (e: any) {
    if (e?.code === 'P2002') return { ok: false, reason: 'conflict' }; // telegramId занят другим аккаунтом
    console.error('[tgNotify] resolve error:', e?.message);
    return { ok: false, reason: 'expired' };
  }
}

/** /stop в боте — выключить дублирование для этого telegram-аккаунта. */
export async function disableNotifyByTelegramId(telegramId: string): Promise<boolean> {
  const r = await prisma.user.updateMany({
    where: { telegramId },
    data: { telegramNotifyEnabled: false } as any,
  });
  return r.count > 0;
}

// ── Отправка сообщений ботом ─────────────────────────────────────────────────
export async function sendBotMessage(
  chatId: string, html: string, buttonUrl?: string, buttonText = 'Посмотреть в Moooza',
): Promise<void> {
  if (!BOT_TOKEN || !chatId) return;
  try {
    await fetch(`${API_BASE}/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        ...(buttonUrl ? { reply_markup: { inline_keyboard: [[{ text: buttonText, url: buttonUrl }]] } } : {}),
      }),
    });
  } catch { /* best-effort */ }
}

/** Вызывается Prisma-middleware'ом на каждый notification.create. */
export async function tgNotifyFromRow(notif: { userId: string; title?: string | null; body?: string | null; link?: string | null }): Promise<void> {
  try {
    if (!BOT_TOKEN || !notif?.userId) return;
    const user = await prisma.user.findUnique({
      where: { id: notif.userId },
      select: { telegramId: true, telegramNotifyEnabled: true } as any,
    }) as any;
    if (!user?.telegramNotifyEnabled || !user.telegramId) return;

    const title = (notif.title || '').trim();
    const body = (notif.body || '').trim();
    const html = `<b>${escTg(title || 'Уведомление')}</b>${body ? `\n${escTg(body)}` : ''}`;
    const buttonUrl = notif.link ? `${APP_URL}${notif.link.startsWith('/') ? '' : '/'}${notif.link}` : undefined;
    await sendBotMessage(user.telegramId, html, buttonUrl);
  } catch (e: any) {
    console.error('[tgNotify] send error:', e?.message);
  }
}
