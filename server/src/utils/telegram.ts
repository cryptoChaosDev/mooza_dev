const TOKEN = process.env.TELEGRAM_LOG_TOKEN;
const CHAT_ID = process.env.TELEGRAM_LOG_CHAT_ID;
// Bot API endpoint is configurable so a server whose network blocks
// api.telegram.org (e.g. RU ISPs block the IPv4 route) can route through a
// relay that can reach Telegram. Defaults to talking to Telegram directly.
const API_BASE = (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');
const BASE = `${API_BASE}/bot${TOKEN}/sendMessage`;

/**
 * Escape user-supplied text before it goes into a Telegram message sent with
 * parse_mode:'HTML'. Without this, a name/bio/post like
 * `</b><a href="http://evil">click</a>` would render as live markup in admin
 * notifications. Only `< > &` are special for Telegram HTML.
 */
export function escTg(s: string | number | null | undefined): string {
  return String(s ?? '').replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
}

export async function tgLog(text: string): Promise<void> {
  if (!TOKEN || !CHAT_ID) return;
  try {
    await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'HTML',
      }),
    });
  } catch {
    // non-critical, ignore
  }
}

/**
 * Typed helpers for major platform events.
 * Every interpolated argument is user-controlled (names, emails, post/message
 * text, service/artist titles, …) so each is wrapped in escTg() — the static
 * <b> labels stay as real formatting.
 */
const e = escTg;
export const tgEvent = {
  register: (name: string, email: string, city?: string | null) =>
    tgLog(`🆕 <b>Регистрация</b>\n👤 ${e(name)}\n📧 ${e(email)}\n🌍 ${e(city || '—')}`),
  login: (name: string, email: string) =>
    tgLog(`🔑 <b>Вход</b>\n👤 ${e(name)}\n📧 ${e(email)}`),
  passwordReset: (email: string) =>
    tgLog(`🔓 <b>Сброс пароля</b>\n📧 ${e(email)}`),
  post: (author: string, type: string, preview: string) =>
    tgLog(`📝 <b>Пост</b> (${e(type)})\n👤 ${e(author)}\n${e(preview)}`),
  postLike: (liker: string, author: string) =>
    tgLog(`❤️ <b>Лайк</b>\n${e(liker)} → пост ${e(author)}`),
  postComment: (commenter: string, author: string, text: string) =>
    tgLog(`💭 <b>Комментарий</b>\n${e(commenter)} → ${e(author)}\n«${e(text.slice(0, 80))}»`),
  postReaction: (reactor: string, emoji: string) =>
    tgLog(`${e(emoji)} <b>Реакция</b>\n${e(reactor)}`),
  pollVote: (voter: string, option: string) =>
    tgLog(`📊 <b>Голос в опросе</b>\n${e(voter)} → «${e(option)}»`),
  postSave: (saver: string) => tgLog(`⭐ <b>Сохранён пост</b>\n${e(saver)}`),
  message: (from: string, to: string, preview: string) =>
    tgLog(`💬 <b>Сообщение</b>\n${e(from)} → ${e(to)}\n«${e(preview.slice(0, 80))}»`),
  friendRequest: (from: string, to: string) =>
    tgLog(`👋 <b>Запрос дружбы</b>\n${e(from)} → ${e(to)}`),
  friendAccept: (a: string, b: string) =>
    tgLog(`🤝 <b>Подружились</b>\n${e(a)} ↔ ${e(b)}`),
  connectionRequest: (from: string, to: string, services: string) =>
    tgLog(`🔗 <b>Запрос связи</b>\n${e(from)} → ${e(to)}\n📋 ${e(services)}`),
  connectionAccept: (a: string, b: string) =>
    tgLog(`✅ <b>Связь установлена</b>\n${e(a)} ↔ ${e(b)}`),
  favorite: (from: string, to: string) =>
    tgLog(`💛 <b>В избранное</b>\n${e(from)} → ${e(to)}`),
  service: (action: string, owner: string, name: string) =>
    tgLog(`🛠 <b>Услуга</b> (${e(action)})\n👤 ${e(owner)}\n📦 ${e(name)}`),
  deal: (action: string, customer: string, executor: string, title: string, status: string) =>
    tgLog(`💼 <b>Сделка</b> (${e(action)})\n${e(customer)} → ${e(executor)}\n📦 «${e(title)}»\n📊 ${e(status)}`),
  review: (author: string, target: string, rating: number) =>
    tgLog(`⭐ <b>Отзыв</b>\n${e(author)} → ${e(target)}\n${rating}/10`),
  artist: (action: string, name: string, by: string) =>
    tgLog(`🎵 <b>Артист</b> (${e(action)})\n🎤 ${e(name)}\n👤 ${e(by)}`),
  complaint: (reporter: string, targetType: string, category: string, risk: number) =>
    tgLog(`🚨 <b>Жалоба</b> (риск ${risk}/100)\n${e(reporter)} → ${e(targetType)}\n📋 ${e(category)}`),
  block: (admin: string, target: string, until: string) =>
    tgLog(`🚫 <b>Блокировка</b>\nАдмин: ${e(admin)}\nКого: ${e(target)}\nДо: ${e(until)}`),
  waitlist: (email: string, type: string) =>
    tgLog(`📋 <b>Заявка (waitlist)</b>\n📧 ${e(email)}\n📌 ${e(type)}`),
  professionRequest: (user: string, profession: string, comment?: string) =>
    tgLog(`➕ <b>Запрос на добавление профессии</b>\n👤 ${e(user)}\n🧩 «${e(profession)}»${comment ? `\n💬 ${e(comment)}` : ''}`),
};
