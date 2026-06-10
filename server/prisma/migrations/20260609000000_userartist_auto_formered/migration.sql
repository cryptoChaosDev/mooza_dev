-- Tracks members auto-demoted to FORMER_MEMBER when the artist left ACTIVE,
-- so reactivating the artist restores exactly that set (not manual ex-members).
ALTER TABLE "UserArtist" ADD COLUMN "autoFormered" BOOLEAN NOT NULL DEFAULT false;
