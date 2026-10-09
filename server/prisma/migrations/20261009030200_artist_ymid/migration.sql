-- Денормализованный id артиста Яндекс.Музыки (из socialLinks.yandex_music):
--  * уникален между артистами — к карточке нельзя привязать чужую дискографию;
--  * индекс для блока «похожие артисты» (раньше GET /artists/:id грузил ВСЕХ
--    верифицированных артистов на каждый просмотр).
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "ymId" TEXT;

-- Заполнение из socialLinks. Если одну страницу ЯМ уже указали несколько
-- артистов, ymId получает только один: VERIFIED → APPROVED → самый ранний.
-- У остальных ymId остаётся NULL (ссылка в контактах сохраняется, но ночной
-- синк по ним не идёт, пока модератор/поддержка не разберётся с дублем).
WITH src AS (
    SELECT "id",
           "status",
           "createdAt",
           substring(lower("socialLinks"->>'yandex_music') from 'music\.yandex\.(?:ru|com)/artist/([0-9]+)') AS ym
      FROM "Artist"
     WHERE "ymId" IS NULL
       AND jsonb_typeof("socialLinks") = 'object'
       AND jsonb_typeof("socialLinks"->'yandex_music') = 'string'
), ranked AS (
    SELECT "id", ym,
           row_number() OVER (
               PARTITION BY ym
               ORDER BY ("status" = 'VERIFIED') DESC, ("status" = 'APPROVED') DESC, "createdAt" ASC, "id" ASC
           ) AS rn
      FROM src
     WHERE ym IS NOT NULL
)
UPDATE "Artist" a
   SET "ymId" = r.ym
  FROM ranked r
 WHERE a."id" = r."id"
   AND r.rn = 1
   AND NOT EXISTS (SELECT 1 FROM "Artist" b WHERE b."ymId" = r.ym);

-- NULL допускается многократно (Postgres не считает NULL равными).
CREATE UNIQUE INDEX IF NOT EXISTS "Artist_ymId_key" ON "Artist"("ymId");
