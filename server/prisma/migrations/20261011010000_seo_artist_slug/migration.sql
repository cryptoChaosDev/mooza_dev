-- Ф4 «Moooza без регистрации»: человекочитаемые адреса артистов /artist/:slug.
-- Аддитивно и идемпотентно (IF NOT EXISTS / CREATE OR REPLACE) — повторный
-- прогон безопасен. В схеме есть GENERATED-колонки (*Norm) — применять ТОЛЬКО
-- через этот SQL (prisma migrate deploy), НЕ через `prisma db push`.
--
-- Слаг: транслитерация имени (кириллица → латиница, «яндексовая» схема:
-- ж=zh, х=kh, ц=ts, ч=ch, ш=sh, щ=shch, ю=yu, я=ya, й/ы=y, ъ/ь — пусто,
-- ё=e; латинская диакритика снимается), нижний регистр, только [a-z0-9-],
-- дефисы схлопнуты, не длиннее 80. Дубли — суффикс -2, -3, …; зарезервированные
-- слова (подмаршруты /artist/:id/… и GET-маршруты /api/artists/…) и UUID-подобные
-- строки не выдаются. Та же схема — в server/src/lib/artistSlug.ts (новые и
-- переименованные артисты); здесь — разовое заполнение существующих.

ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "slug" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Artist_slug_key" ON "Artist"("slug");

-- Прежние слаги (после переименования) — для 301 со старого адреса.
CREATE TABLE IF NOT EXISTS "ArtistSlugHistory" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtistSlugHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ArtistSlugHistory_slug_key" ON "ArtistSlugHistory"("slug");
CREATE INDEX IF NOT EXISTS "ArtistSlugHistory_artistId_idx" ON "ArtistSlugHistory"("artistId");

DO $$
BEGIN
    ALTER TABLE "ArtistSlugHistory"
        ADD CONSTRAINT "ArtistSlugHistory_artistId_fkey"
        FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Временная функция транслитерации (удаляется в конце миграции).
-- Регистр кириллицы и диакритики переводится явно через translate — не зависим
-- от локали (LC_CTYPE) базы; ASCII приводит lower().
CREATE OR REPLACE FUNCTION "mooza_seo_slugify"(src TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
    s TEXT := coalesce(src, '');
BEGIN
    s := translate(s, 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯІЇЄҐЎ', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюяіїєґў');
    s := translate(s,
        'ÀÁÂÃÄÅĀĂĄÇĆĈĊČĎÈÉÊËĒĔĖĘĚĜĞĠĢĤÌÍÎÏĨĪĬĮĴĶĹĻĽŃŅŇÑÒÓÔÕÖŌŎŐŔŖŘŚŜŞŠŢŤÙÚÛÜŨŪŬŮŰŲŴÝŸŶŹŻŽØŁĐÐÆŒ',
        'àáâãäåāăąçćĉċčďèéêëēĕėęěĝğġģĥìíîïĩīĭįĵķĺļľńņňñòóôõöōŏőŕŗřśŝşšţťùúûüũūŭůűųŵýÿŷźżžøłđðæœ');
    s := lower(s);
    -- многобуквенные соответствия — до однобуквенных
    s := replace(s, 'щ', 'shch');
    s := replace(s, 'ж', 'zh');
    s := replace(s, 'х', 'kh');
    s := replace(s, 'ц', 'ts');
    s := replace(s, 'ч', 'ch');
    s := replace(s, 'ш', 'sh');
    s := replace(s, 'ю', 'yu');
    s := replace(s, 'я', 'ya');
    s := replace(s, 'ї', 'yi');
    s := replace(s, 'є', 'ye');
    s := replace(s, 'ß', 'ss');
    s := replace(s, 'æ', 'ae');
    s := replace(s, 'œ', 'oe');
    s := translate(s, 'абвгдеёзийклмнопрстуфыэіґўøłđðı', 'abvgdeeziyklmnoprstufyeiguolddi');
    -- ъ, ь и апострофы — удаляются (translate без пары = удаление)
    s := translate(s, 'ъь''’ʼ`', '');
    s := translate(s,
        'àáâãäåāăąçćĉċčďèéêëēĕėęěĝğġģĥìíîïĩīĭįĵķĺļľńņňñòóôõöōŏőŕŗřśŝşšţťùúûüũūŭůűųŵýÿŷźżž',
        'aaaaaaaaacccccdeeeeeeeeegggghiiiiiiiijklllnnnnoooooooorrrssssttuuuuuuuuuuwyyyzzz');
    s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
    s := regexp_replace(s, '^-+|-+$', '', 'g');
    s := regexp_replace(left(s, 80), '-+$', '');
    RETURN s;
END
$fn$;

-- Заполнение существующих артистов. Порядок выдачи «чистого» слага:
-- VERIFIED → APPROVED → самый ранний (как у ymId), остальным — -2, -3, …
DO $$
DECLARE
    r RECORD;
    base TEXT;
    cand TEXT;
    sfx TEXT;
    n INT;
    reserved TEXT[] := ARRAY[
        'add', 'admin', 'admins', 'api', 'artist', 'artists', 'avatar', 'banner',
        'check-name', 'clips', 'contacts', 'create', 'edit', 'follow', 'following',
        'genres', 'groups', 'invite', 'invite-link', 'invites', 'join', 'join-request',
        'join-requests', 'members', 'memberships', 'my-invites', 'new', 'null',
        'releases', 'search', 'settings', 'suggest', 'undefined', 'vacancies'
    ];
BEGIN
    FOR r IN
        SELECT "id", "name"
          FROM "Artist"
         WHERE "slug" IS NULL
         ORDER BY ("status" = 'VERIFIED') DESC, ("status" = 'APPROVED') DESC, "createdAt" ASC, "id" ASC
    LOOP
        base := "mooza_seo_slugify"(r."name");
        IF base IS NULL OR base = '' THEN
            base := 'artist';
        END IF;
        n := 1;
        LOOP
            IF n = 1 THEN
                cand := base;
            ELSE
                sfx := '-' || n::TEXT;
                cand := regexp_replace(left(base, 80 - length(sfx)), '-+$', '') || sfx;
            END IF;
            EXIT WHEN NOT (cand = ANY (reserved))
                  AND cand !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  AND NOT EXISTS (SELECT 1 FROM "Artist" a WHERE a."slug" = cand)
                  AND NOT EXISTS (SELECT 1 FROM "ArtistSlugHistory" h WHERE h."slug" = cand);
            n := n + 1;
        END LOOP;
        UPDATE "Artist" SET "slug" = cand WHERE "id" = r."id";
    END LOOP;
END $$;

DROP FUNCTION IF EXISTS "mooza_seo_slugify"(TEXT);
