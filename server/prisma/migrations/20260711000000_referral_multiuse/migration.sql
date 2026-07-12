-- Многоразовые ссылки-кампании (конференции/акции): не сгорают, счётчик регистраций
ALTER TABLE "ReferralLink" ADD COLUMN IF NOT EXISTS "multiUse" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReferralLink" ADD COLUMN IF NOT EXISTS "usedCount" INTEGER NOT NULL DEFAULT 0;
