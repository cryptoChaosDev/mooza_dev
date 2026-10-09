-- Кто отправил заявку на верификацию — отдельным полем. Раньше это писалось в
-- Artist.submittedById (перезаписывалось каждым подавшим админом), а легаси-ручки
-- /api/groups и часть клиента считали submittedById владельцем. Права теперь
-- только через UserArtist.isOwner / isAdmin; submittedById больше не трогаем.
ALTER TABLE "Artist" ADD COLUMN IF NOT EXISTS "verificationRequestedById" TEXT;

-- Перенос: для уже поданных заявок показываем модератору того же подавшего.
UPDATE "Artist"
   SET "verificationRequestedById" = "submittedById"
 WHERE "verificationRequestedById" IS NULL
   AND "submittedById" IS NOT NULL
   AND "verificationProofUrl" IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Artist_verificationRequestedById_fkey'
    ) THEN
        ALTER TABLE "Artist"
            ADD CONSTRAINT "Artist_verificationRequestedById_fkey"
            FOREIGN KEY ("verificationRequestedById") REFERENCES "User"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
