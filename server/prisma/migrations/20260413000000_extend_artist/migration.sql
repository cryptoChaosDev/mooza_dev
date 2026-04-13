-- Remove unique constraint on Artist.name
ALTER TABLE "Artist" DROP CONSTRAINT IF EXISTS "Artist_name_key";

-- Add ArtistType enum
CREATE TYPE "ArtistType" AS ENUM ('SOLO', 'GROUP', 'COVER_GROUP');

-- Extend Artist table
ALTER TABLE "Artist"
  ADD COLUMN "type"        "ArtistType",
  ADD COLUMN "city"        TEXT,
  ADD COLUMN "tourReady"   TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "socialLinks" JSONB,
  ADD COLUMN "bandLink"    TEXT,
  ADD COLUMN "avatar"      TEXT,
  ADD COLUMN "banner"      TEXT,
  ADD COLUMN "listeners"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ArtistGenre join table
CREATE TABLE "ArtistGenre" (
  "artistId" TEXT NOT NULL,
  "genreId"  TEXT NOT NULL,
  CONSTRAINT "ArtistGenre_pkey" PRIMARY KEY ("artistId", "genreId"),
  CONSTRAINT "ArtistGenre_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE,
  CONSTRAINT "ArtistGenre_genreId_fkey"  FOREIGN KEY ("genreId")  REFERENCES "Genre"("id")  ON DELETE CASCADE
);

-- ArtistFollower join table
CREATE TABLE "ArtistFollower" (
  "userId"    TEXT NOT NULL,
  "artistId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArtistFollower_pkey"      PRIMARY KEY ("userId", "artistId"),
  CONSTRAINT "ArtistFollower_userId_fkey"   FOREIGN KEY ("userId")   REFERENCES "User"("id")   ON DELETE CASCADE,
  CONSTRAINT "ArtistFollower_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE
);

CREATE INDEX "ArtistGenre_genreId_idx"      ON "ArtistGenre"("genreId");
CREATE INDEX "ArtistFollower_artistId_idx"  ON "ArtistFollower"("artistId");
