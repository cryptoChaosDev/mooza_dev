-- Telegram notification duplication opt-in flag
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramNotifyEnabled" BOOLEAN NOT NULL DEFAULT false;
