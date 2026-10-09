-- «Ищу музыканта»: журнал запросов (лимит 5 в сутки) и анти-спам рассылки
-- подходящим исполнителям (без повторов по заказу, ≤ 5 в сутки на исполнителя).
-- Аддитивно и идемпотентно (IF NOT EXISTS) — повторный прогон безопасен.
-- В схеме есть GENERATED-колонки (*Norm) — применять ТОЛЬКО через этот SQL
-- (prisma migrate deploy), НЕ через `prisma db push`.

CREATE TABLE IF NOT EXISTS "MusicianRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "professionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notifiedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MusicianRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MusicianRequest_userId_createdAt_idx" ON "MusicianRequest"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "MusicianRequest_orderId_idx" ON "MusicianRequest"("orderId");

CREATE TABLE IF NOT EXISTS "OrderMatchNotification" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderMatchNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrderMatchNotification_orderId_userId_key" ON "OrderMatchNotification"("orderId", "userId");
CREATE INDEX IF NOT EXISTS "OrderMatchNotification_userId_createdAt_idx" ON "OrderMatchNotification"("userId", "createdAt");

-- Внешние ключи (в Prisma-схеме relation не объявлены — см. комментарий у моделей).
DO $$
BEGIN
    ALTER TABLE "MusicianRequest"
        ADD CONSTRAINT "MusicianRequest_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "MusicianRequest"
        ADD CONSTRAINT "MusicianRequest_orderId_fkey"
        FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "OrderMatchNotification"
        ADD CONSTRAINT "OrderMatchNotification_orderId_fkey"
        FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "OrderMatchNotification"
        ADD CONSTRAINT "OrderMatchNotification_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
