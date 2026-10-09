-- «Отвечает быстро»: кэш суточного пересчёта (server/src/lib/responseBadge.ts).
-- responseBadge — 'fast' (медиана первого ответа ≤ 60 мин) | 'day' (≤ 24 ч) |
-- NULL; считается только при ≥ 5 личных диалогах за 90 дней. Минуты
-- (responseMedianMinutes) гостю не отдаются никогда — только категория.
-- Аддитивно и идемпотентно (IF NOT EXISTS) — повторный прогон безопасен.
-- В схеме есть GENERATED-колонки (*Norm) — применять ТОЛЬКО через этот SQL
-- (prisma migrate deploy), НЕ через `prisma db push`.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "responseBadge" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "responseBadgeAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "responseMedianMinutes" INTEGER;
