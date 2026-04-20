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
