-- Обогащение данными Яндекс.Музыки: дельта/витрина артиста, история слушателей,
-- метаданные релизов (тип, лейбл, жанр, треклист, лайки).
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "listenersDelta" INTEGER;
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "ymData" JSONB;

CREATE TABLE IF NOT EXISTS "ArtistListenersSnapshot" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "listeners" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtistListenersSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ArtistListenersSnapshot_artistId_createdAt_idx"
    ON "ArtistListenersSnapshot"("artistId", "createdAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ArtistListenersSnapshot_artistId_fkey'
    ) THEN
        ALTER TABLE "ArtistListenersSnapshot"
            ADD CONSTRAINT "ArtistListenersSnapshot_artistId_fkey"
            FOREIGN KEY ("artistId") REFERENCES "Artist"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "releaseType" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "genre" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "trackCount" INTEGER;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "likesCount" INTEGER;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "tracklist" JSONB;
