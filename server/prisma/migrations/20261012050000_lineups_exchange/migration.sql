-- «Биржа лайнапов»: запросы на выступление (публикует любой авторизованный
-- пользователь) и отклики артистов (от имени артиста — его админ/владелец).
-- Аддитивно и идемпотентно (IF NOT EXISTS / duplicate_object) — повторный
-- прогон безопасен; существующие таблицы не меняются. В схеме есть
-- GENERATED-колонки (*Norm) — применять ТОЛЬКО через prisma migrate deploy.

-- Запрос: дата+время начала события (UTC, показ по МСК), город из каталога.
CREATE TABLE IF NOT EXISTS "LineupRequest" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "cityId" TEXT,
    "cityName" TEXT NOT NULL,
    "venue" TEXT,
    "slots" INTEGER NOT NULL,
    "slotType" TEXT NOT NULL DEFAULT 'any',
    "feeType" TEXT NOT NULL DEFAULT 'negotiable',
    "feeAmount" INTEGER,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineupRequest_pkey" PRIMARY KEY ("id")
);

-- Жанры запроса (как ArtistGenre — связующая таблица).
CREATE TABLE IF NOT EXISTS "LineupRequestGenre" (
    "requestId" TEXT NOT NULL,
    "genreId" TEXT NOT NULL,

    CONSTRAINT "LineupRequestGenre_pkey" PRIMARY KEY ("requestId","genreId")
);

-- Отклик артиста: один на пару (запрос, артист).
CREATE TABLE IF NOT EXISTS "LineupResponse" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "submittedById" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineupResponse_pkey" PRIMARY KEY ("id")
);

-- Кому из артистов ушло уведомление о запросе (матчинг/приглашение):
-- дедуп при редактировании и суточный лимит на артиста.
CREATE TABLE IF NOT EXISTS "LineupMatch" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'match',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineupMatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LineupRequest_authorId_idx" ON "LineupRequest"("authorId");
CREATE INDEX IF NOT EXISTS "LineupRequest_status_eventDate_idx" ON "LineupRequest"("status", "eventDate");
CREATE INDEX IF NOT EXISTS "LineupRequest_cityName_idx" ON "LineupRequest"("cityName");
CREATE INDEX IF NOT EXISTS "LineupRequestGenre_genreId_idx" ON "LineupRequestGenre"("genreId");
CREATE INDEX IF NOT EXISTS "LineupResponse_artistId_idx" ON "LineupResponse"("artistId");
CREATE INDEX IF NOT EXISTS "LineupResponse_requestId_status_idx" ON "LineupResponse"("requestId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "LineupResponse_requestId_artistId_key" ON "LineupResponse"("requestId", "artistId");
CREATE INDEX IF NOT EXISTS "LineupMatch_artistId_createdAt_idx" ON "LineupMatch"("artistId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "LineupMatch_requestId_artistId_key" ON "LineupMatch"("requestId", "artistId");

DO $$
BEGIN
    ALTER TABLE "LineupRequest" ADD CONSTRAINT "LineupRequest_authorId_fkey"
        FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "LineupRequest" ADD CONSTRAINT "LineupRequest_cityId_fkey"
        FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "LineupRequestGenre" ADD CONSTRAINT "LineupRequestGenre_requestId_fkey"
        FOREIGN KEY ("requestId") REFERENCES "LineupRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "LineupRequestGenre" ADD CONSTRAINT "LineupRequestGenre_genreId_fkey"
        FOREIGN KEY ("genreId") REFERENCES "Genre"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "LineupResponse" ADD CONSTRAINT "LineupResponse_requestId_fkey"
        FOREIGN KEY ("requestId") REFERENCES "LineupRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "LineupResponse" ADD CONSTRAINT "LineupResponse_artistId_fkey"
        FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "LineupResponse" ADD CONSTRAINT "LineupResponse_submittedById_fkey"
        FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "LineupMatch" ADD CONSTRAINT "LineupMatch_requestId_fkey"
        FOREIGN KEY ("requestId") REFERENCES "LineupRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "LineupMatch" ADD CONSTRAINT "LineupMatch_artistId_fkey"
        FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
