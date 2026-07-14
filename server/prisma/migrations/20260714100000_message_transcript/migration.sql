-- Расшифровка голосового сообщения (заполняется по запросу пользователя)
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "transcript" TEXT;
