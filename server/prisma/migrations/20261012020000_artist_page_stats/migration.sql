-- Визитка артиста («ссылка в био»): статистика просмотров страницы /artist/<slug>
-- и переходов по ссылкам площадок — агрегаты за календарный день по МСК.
-- Без ПДн: ни IP, ни userId, ни User-Agent не хранятся — только счётчики.
-- Аддитивно и идемпотентно (IF NOT EXISTS) — повторный прогон безопасен.
-- В схеме есть GENERATED-колонки (*Norm) — применять ТОЛЬКО через этот SQL
-- (prisma migrate deploy), НЕ через `prisma db push`.

CREATE TABLE IF NOT EXISTS "ArtistPageStat" (
    "artistId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "clicks" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtistPageStat_pkey" PRIMARY KEY ("artistId", "day")
);

DO $$
BEGIN
    ALTER TABLE "ArtistPageStat"
        ADD CONSTRAINT "ArtistPageStat_artistId_fkey"
        FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
