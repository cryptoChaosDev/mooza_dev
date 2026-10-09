-- Ссылки-приглашения в артиста (ArtistInvite) были бессрочными и безлимитными:
-- утёкшая ссылка навсегда давала вступление в состав. Добавляем срок действия
-- и лимит использований (аддитивно).
ALTER TABLE "ArtistInvite" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "ArtistInvite" ADD COLUMN IF NOT EXISTS "maxUses" INTEGER;
ALTER TABLE "ArtistInvite" ADD COLUMN IF NOT EXISTS "usedCount" INTEGER NOT NULL DEFAULT 0;

-- Уже розданные ссылки не обрываем мгновенно: даём им 30 дней с момента
-- применения миграции (новые ссылки сервер создаёт сразу с expiresAt = +30 дней).
UPDATE "ArtistInvite"
   SET "expiresAt" = CURRENT_TIMESTAMP + INTERVAL '30 days'
 WHERE "expiresAt" IS NULL;
