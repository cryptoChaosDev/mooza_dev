-- Гостевой режим «Moooza без регистрации» (Ф3, серверная часть): согласия.
-- Аддитивно и идемпотентно (IF NOT EXISTS) — повторный прогон безопасен.
-- В схеме есть GENERATED-колонки (*Norm) — применять ТОЛЬКО через этот SQL
-- (prisma migrate deploy), НЕ через `prisma db push`.

-- Отзыв согласия на публичное распространение ПДн (152-ФЗ ст. 10.1)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "publicConsentRevokedAt" TIMESTAMP(3);
-- Запрет индексации профиля поисковиками (на видимость гостям не влияет)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "searchIndexingOptOut" BOOLEAN NOT NULL DEFAULT false;
-- Окно «Сделайте профиль публичным»: дата последнего показа и счётчик показов
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "publicConsentPromptAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "publicConsentPromptCount" INTEGER NOT NULL DEFAULT 0;

-- Журнал согласий: тип (pd_public | pd | marketing | terms), действие (grant | revoke)
CREATE TABLE IF NOT EXISTS "ConsentEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "version" TEXT,
    "source" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ConsentEvent_userId_createdAt_idx" ON "ConsentEvent"("userId", "createdAt");

DO $$
BEGIN
    ALTER TABLE "ConsentEvent"
        ADD CONSTRAINT "ConsentEvent_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
