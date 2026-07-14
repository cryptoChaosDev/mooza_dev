-- Настройки уведомлений по категориям (null = всё включено)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notificationPrefs" JSONB;
