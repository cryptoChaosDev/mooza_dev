-- Смена email через подтверждение кодом на новый адрес: новое значение ждёт в
-- pendingEmail и применяется только после POST /users/me/email/confirm.
-- Хранится HMAC кода, а не сам код. Аддитивно: только новые nullable-колонки.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingEmail" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingEmailCodeHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingEmailExpires" TIMESTAMP(3);
