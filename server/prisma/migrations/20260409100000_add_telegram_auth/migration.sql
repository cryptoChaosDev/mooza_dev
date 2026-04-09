-- Make email and password nullable (for Telegram-only users)
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;

-- Add Telegram fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramUsername" TEXT;

-- Unique index on telegramId
CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramId_key" ON "User"("telegramId");
