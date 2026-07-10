-- Логическое удаление реф-ссылок: скрытая ссылка исчезает из списка, но код работает
ALTER TABLE "ReferralLink" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);
