-- Происхождение импортированных релизов/клипов + «надгробия» удалённых.
-- Ночной синк Яндекс.Музыки дедуплицировал по подстроке url и по названию:
-- воскрешал удалённые пользователем элементы и при параллельных прогонах
-- плодил дубли. Теперь ключ — точный (artistId, externalSource, externalId).
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "externalSource" TEXT;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "externalSource" TEXT;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "externalId" TEXT;

-- Релизы: ссылка ровно на альбом ЯМ → ('yandex_music', albumId). Если у артиста
-- уже есть дубли одного альбома (следствие гонки синка), ключ получает только
-- самый ранний; остальные остаются с NULL (как ручные) — их можно удалить руками.
WITH src AS (
    SELECT "id", "artistId", "createdAt",
           substring(lower("url") from '^https?://(?:www\.)?music\.yandex\.[a-z]+/album/([0-9]+)/?(?:[?#].*)?$') AS ext
      FROM "Release"
     WHERE "externalId" IS NULL
), ranked AS (
    SELECT "id", "artistId", ext,
           row_number() OVER (PARTITION BY "artistId", ext ORDER BY "createdAt" ASC, "id" ASC) AS rn
      FROM src
     WHERE ext IS NOT NULL
)
UPDATE "Release" r
   SET "externalSource" = 'yandex_music', "externalId" = k.ext
  FROM ranked k
 WHERE r."id" = k."id"
   AND k.rn = 1
   AND NOT EXISTS (
       SELECT 1 FROM "Release" x
        WHERE x."artistId" = k."artistId" AND x."externalSource" = 'yandex_music' AND x."externalId" = k.ext
   );

-- Клипы: YouTube watch?v=<id> → 'youtube:<id>' (id регистрозависим — без lower);
-- клипы-плееры ЯМ (frontend.vh.yandex.ru) → 'yandex:<url без query>'.
WITH src AS (
    SELECT "id", "artistId", "createdAt",
           CASE
             WHEN "url" ~ '^https?://(www\.|m\.)?youtube\.com/watch\?v=[A-Za-z0-9_-]+'
               THEN 'youtube:' || substring("url" from 'v=([A-Za-z0-9_-]+)')
             WHEN "platform" = 'YANDEX_MUSIC' AND "url" ~* '^https?://frontend\.vh\.yandex\.ru/'
               THEN 'yandex:' || split_part("url", '?', 1)
             ELSE NULL
           END AS ext
      FROM "Clip"
     WHERE "externalId" IS NULL
), ranked AS (
    SELECT "id", "artistId", ext,
           row_number() OVER (PARTITION BY "artistId", ext ORDER BY "createdAt" ASC, "id" ASC) AS rn
      FROM src
     WHERE ext IS NOT NULL
)
UPDATE "Clip" c
   SET "externalSource" = 'yandex_music', "externalId" = k.ext
  FROM ranked k
 WHERE c."id" = k."id"
   AND k.rn = 1
   AND NOT EXISTS (
       SELECT 1 FROM "Clip" x
        WHERE x."artistId" = k."artistId" AND x."externalSource" = 'yandex_music' AND x."externalId" = k.ext
   );

-- Уникальность: NULL-ключи (ручные элементы) не конфликтуют между собой.
CREATE UNIQUE INDEX IF NOT EXISTS "Release_artistId_externalSource_externalId_key"
    ON "Release"("artistId", "externalSource", "externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "Clip_artistId_externalSource_externalId_key"
    ON "Clip"("artistId", "externalSource", "externalId");

CREATE TABLE IF NOT EXISTS "DismissedMediaItem" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "externalSource" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DismissedMediaItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DismissedMediaItem_artistId_kind_externalSource_externalId_key"
    ON "DismissedMediaItem"("artistId", "kind", "externalSource", "externalId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DismissedMediaItem_artistId_fkey'
    ) THEN
        ALTER TABLE "DismissedMediaItem"
            ADD CONSTRAINT "DismissedMediaItem_artistId_fkey"
            FOREIGN KEY ("artistId") REFERENCES "Artist"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
