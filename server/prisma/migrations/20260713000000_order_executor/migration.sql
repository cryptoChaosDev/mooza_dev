-- Выбор исполнителя заказа: после выбора отклики закрыты, заказ остаётся видимым
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "executorId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "executorChosenAt" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_executorId_fkey"
    FOREIGN KEY ("executorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Order_executorId_idx" ON "Order"("executorId");
