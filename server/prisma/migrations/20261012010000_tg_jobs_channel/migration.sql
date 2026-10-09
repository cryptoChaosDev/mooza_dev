-- Автопостинг новых заказов и вакансий в общий Telegram-канал (lib/jobsChannel).
-- Аддитивно и идемпотентно (IF NOT EXISTS) — повторный прогон безопасен.
-- В схеме есть GENERATED-колонки (*Norm) — применять ТОЛЬКО этим SQL
-- (prisma migrate deploy), НЕ через `prisma db push`.
--
--   telegramMessageId — message_id поста в канале (NULL — ещё не публиковали);
--   telegramPostedAt  — момент публикации; ставится условным UPDATE ДО отправки
--                       («застолбить» — защита от дублей при гонках);
--   telegramClosedAt  — пост помечен «⛔ Закрыто» (заказ/вакансия закрыты).
--
-- Флаг включения — SiteSetting 'jobsChannelEnabled' (по умолчанию выключен),
-- момент включения — SiteSetting 'jobsChannelEnabledAt'. Строки SiteSetting
-- миграция не создаёт: значения по умолчанию заданы в коде.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "telegramMessageId" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "telegramPostedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "telegramClosedAt" TIMESTAMP(3);

ALTER TABLE "Vacancy" ADD COLUMN IF NOT EXISTS "telegramMessageId" INTEGER;
ALTER TABLE "Vacancy" ADD COLUMN IF NOT EXISTS "telegramPostedAt" TIMESTAMP(3);
ALTER TABLE "Vacancy" ADD COLUMN IF NOT EXISTS "telegramClosedAt" TIMESTAMP(3);
