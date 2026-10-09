-- «Подтверждённый опыт» в профиле и мини-бейдж «N релизов» в каталоге:
-- выборки участий по пользователю (userId + confirmStatus = ACCEPTED).
-- Раньше был только уникальный индекс (releaseId, userId) — по userId он не
-- помогает. Аддитивно и идемпотентно (IF NOT EXISTS) — повторный прогон
-- безопасен. В схеме есть GENERATED-колонки (*Norm) — применять ТОЛЬКО через
-- этот SQL (prisma migrate deploy), НЕ через `prisma db push`.

CREATE INDEX IF NOT EXISTS "ReleaseParticipant_userId_confirmStatus_idx" ON "ReleaseParticipant"("userId", "confirmStatus");
CREATE INDEX IF NOT EXISTS "ClipParticipant_userId_confirmStatus_idx" ON "ClipParticipant"("userId", "confirmStatus");
