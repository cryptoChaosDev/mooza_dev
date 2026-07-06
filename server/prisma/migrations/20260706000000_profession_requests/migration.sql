-- Очередь запросов на добавление профессии (модерация в админке)
CREATE TABLE IF NOT EXISTS "ProfessionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profession" TEXT NOT NULL,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProfessionRequest_status_idx" ON "ProfessionRequest"("status");

ALTER TABLE "ProfessionRequest" ADD CONSTRAINT "ProfessionRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
