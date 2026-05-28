const TOKEN = process.env.TELEGRAM_LOG_TOKEN;
const CHAT_ID = process.env.TELEGRAM_LOG_CHAT_ID;
const BASE = `https://api.telegram.org/bot${TOKEN}/sendMessage`;

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

/** Typed helpers for major platform events */
export const tgEvent = {
  register: (name: string, email: string, city?: string | null) =>
    tgLog(`🆕 <b>Регистрация</b>\n👤 ${name}\n📧 ${email}\n🌍 ${city || '—'}`),
  login: (name: string, email: string) =>
    tgLog(`🔑 <b>Вход</b>\n👤 ${name}\n📧 ${email}`),
  passwordReset: (email: string) =>
    tgLog(`🔓 <b>Сброс пароля</b>\n📧 ${email}`),
  post: (author: string, type: string, preview: string) =>
    tgLog(`📝 <b>Пост</b> (${type})\n👤 ${author}\n${preview}`),
  postLike: (liker: string, author: string) =>
    tgLog(`❤️ <b>Лайк</b>\n${liker} → пост ${author}`),
  postComment: (commenter: string, author: string, text: string) =>
    tgLog(`💭 <b>Комментарий</b>\n${commenter} → ${author}\n«${text.slice(0, 80)}»`),
  postReaction: (reactor: string, emoji: string) =>
    tgLog(`${emoji} <b>Реакция</b>\n${reactor}`),
  pollVote: (voter: string, option: string) =>
    tgLog(`📊 <b>Голос в опросе</b>\n${voter} → «${option}»`),
  postSave: (saver: string) => tgLog(`⭐ <b>Сохранён пост</b>\n${saver}`),
  message: (from: string, to: string, preview: string) =>
    tgLog(`💬 <b>Сообщение</b>\n${from} → ${to}\n«${preview.slice(0, 80)}»`),
  friendRequest: (from: string, to: string) =>
    tgLog(`👋 <b>Запрос дружбы</b>\n${from} → ${to}`),
  friendAccept: (a: string, b: string) =>
    tgLog(`🤝 <b>Подружились</b>\n${a} ↔ ${b}`),
  connectionRequest: (from: string, to: string, services: string) =>
    tgLog(`🔗 <b>Запрос связи</b>\n${from} → ${to}\n📋 ${services}`),
  connectionAccept: (a: string, b: string) =>
    tgLog(`✅ <b>Связь установлена</b>\n${a} ↔ ${b}`),
  favorite: (from: string, to: string) =>
    tgLog(`💛 <b>В избранное</b>\n${from} → ${to}`),
  service: (action: string, owner: string, name: string) =>
    tgLog(`🛠 <b>Услуга</b> (${action})\n👤 ${owner}\n📦 ${name}`),
  deal: (action: string, customer: string, executor: string, title: string, status: string) =>
    tgLog(`💼 <b>Сделка</b> (${action})\n${customer} → ${executor}\n📦 «${title}»\n📊 ${status}`),
  review: (author: string, target: string, rating: number) =>
    tgLog(`⭐ <b>Отзыв</b>\n${author} → ${target}\n${rating}/10`),
  artist: (action: string, name: string, by: string) =>
    tgLog(`🎵 <b>Артист</b> (${action})\n🎤 ${name}\n👤 ${by}`),
  complaint: (reporter: string, targetType: string, category: string, risk: number) =>
    tgLog(`🚨 <b>Жалоба</b> (риск ${risk}/100)\n${reporter} → ${targetType}\n📋 ${category}`),
  block: (admin: string, target: string, until: string) =>
    tgLog(`🚫 <b>Блокировка</b>\nАдмин: ${admin}\nКого: ${target}\nДо: ${until}`),
};
