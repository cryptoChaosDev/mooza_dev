-- ============ EXTEND EXISTING ENUMS ============
-- New values added to existing enums. ADD VALUE is non-transactional in older PG
-- but these are idempotent and not referenced as defaults/values in this migration.
ALTER TYPE "ArtistType" ADD VALUE IF NOT EXISTS 'DUET';
ALTER TYPE "ArtistType" ADD VALUE IF NOT EXISTS 'TRIBUTE';
ALTER TYPE "ArtistType" ADD VALUE IF NOT EXISTS 'CHOIR';
ALTER TYPE "ArtistType" ADD VALUE IF NOT EXISTS 'ENSEMBLE';
ALTER TYPE "ArtistType" ADD VALUE IF NOT EXISTS 'ORCHESTRA';

ALTER TYPE "GroupInviteStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

-- ============ NEW ENUMS ============
CREATE TYPE "ArtistActivityStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED', 'DISBANDED');
CREATE TYPE "MemberParticipationStatus" AS ENUM ('ACTIVE_MEMBER', 'FORMER_MEMBER');
CREATE TYPE "RoleContext" AS ENUM ('COLLECTIVE', 'RELEASE', 'CLIP');
CREATE TYPE "StreamingPlatform" AS ENUM ('VK', 'SPOTIFY', 'YANDEX_MUSIC', 'APPLE_MUSIC');
CREATE TYPE "ClipPlatform" AS ENUM ('VK_VIDEO', 'RUTUBE', 'YOUTUBE');
CREATE TYPE "ContactsVisibility" AS ENUM ('ALL', 'REGISTERED', 'FRIENDS');

-- ============ ALTER EXISTING TABLES ============
ALTER TABLE "Artist"
  ADD COLUMN "activityStatus" "ArtistActivityStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "UserArtist"
  ADD COLUMN "isAdmin"             BOOLEAN                     NOT NULL DEFAULT false,
  ADD COLUMN "participationStatus" "MemberParticipationStatus" NOT NULL DEFAULT 'ACTIVE_MEMBER';

ALTER TABLE "User"
  ADD COLUMN "contactsVisibility" "ContactsVisibility" NOT NULL DEFAULT 'ALL';

-- Backfill contactsVisibility from the legacy contactsVisible boolean.
UPDATE "User"
  SET "contactsVisibility" = CASE
    WHEN "contactsVisible" THEN 'ALL'::"ContactsVisibility"
    ELSE 'FRIENDS'::"ContactsVisibility"
  END;

-- ============ ROLE CATALOG ============
CREATE TABLE "Role" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "context"   "RoleContext" NOT NULL,
  "category"  TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Role_context_category_name_key" ON "Role"("context", "category", "name");
CREATE INDEX "Role_context_category_idx" ON "Role"("context", "category");

CREATE TABLE "UserArtistRole" (
  "id"           TEXT NOT NULL,
  "userArtistId" TEXT NOT NULL,
  "roleId"       TEXT NOT NULL,

  CONSTRAINT "UserArtistRole_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserArtistRole_userArtistId_fkey" FOREIGN KEY ("userArtistId") REFERENCES "UserArtist"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserArtistRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserArtistRole_userArtistId_roleId_key" ON "UserArtistRole"("userArtistId", "roleId");

-- ============ RELEASES ============
CREATE TABLE "Release" (
  "id"          TEXT NOT NULL,
  "artistId"    TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "coverUrl"    TEXT,
  "releaseDate" TIMESTAMP(3),
  "platform"    "StreamingPlatform" NOT NULL,
  "url"         TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Release_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Release_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Release_artistId_idx" ON "Release"("artistId");

CREATE TABLE "ReleaseParticipant" (
  "id"            TEXT NOT NULL,
  "releaseId"     TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "confirmStatus" "GroupInviteStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReleaseParticipant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReleaseParticipant_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReleaseParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReleaseParticipant_releaseId_userId_key" ON "ReleaseParticipant"("releaseId", "userId");

CREATE TABLE "ReleaseParticipantRole" (
  "id"            TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "roleId"        TEXT NOT NULL,

  CONSTRAINT "ReleaseParticipantRole_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReleaseParticipantRole_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "ReleaseParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReleaseParticipantRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReleaseParticipantRole_participantId_roleId_key" ON "ReleaseParticipantRole"("participantId", "roleId");

-- ============ CLIPS ============
CREATE TABLE "Clip" (
  "id"        TEXT NOT NULL,
  "artistId"  TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "coverUrl"  TEXT,
  "platform"  "ClipPlatform" NOT NULL,
  "url"       TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Clip_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Clip_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Clip_artistId_idx" ON "Clip"("artistId");

CREATE TABLE "ClipParticipant" (
  "id"            TEXT NOT NULL,
  "clipId"        TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "confirmStatus" "GroupInviteStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClipParticipant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClipParticipant_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClipParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ClipParticipant_clipId_userId_key" ON "ClipParticipant"("clipId", "userId");

CREATE TABLE "ClipParticipantRole" (
  "id"            TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "roleId"        TEXT NOT NULL,

  CONSTRAINT "ClipParticipantRole_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClipParticipantRole_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "ClipParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClipParticipantRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ClipParticipantRole_participantId_roleId_key" ON "ClipParticipantRole"("participantId", "roleId");
