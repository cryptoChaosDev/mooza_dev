-- «Сцена»: терпимый поиск по концертам.
-- searchNorm — STORED-колонка (как *Norm у User/Artist): нижний регистр + «ё»→«е»
-- по названию, площадке, городу, типу и организатору. Приложение её не пишет.
ALTER TABLE "Concert" ADD COLUMN "searchNorm" text GENERATED ALWAYS AS (
  translate(lower(
    coalesce("title", '') || ' ' || coalesce("venue", '') || ' ' || coalesce("cityName", '') || ' ' ||
    coalesce("type", '') || ' ' || coalesce("organizer", '')
  ), 'ё', 'е')
) STORED;

-- Поиск с опечатками (word_similarity) — расширение pg_trgm из стандартной поставки Postgres.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Concert_searchNorm_trgm_idx" ON "Concert" USING gin ("searchNorm" gin_trgm_ops);
