-- Согласия, данные при регистрации по email: обработка ПДн (обязательное,
-- 152-ФЗ) и рекламные рассылки (необязательное). Только аддитивные nullable-колонки.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "consentPdAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "consentPdVersion" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "consentMarketingAt" TIMESTAMP(3);
