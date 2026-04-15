-- Add ArtistStatus enum
CREATE TYPE "ArtistStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'VERIFIED');

-- Add moderation columns to Artist
ALTER TABLE "Artist"
  ADD COLUMN "status"               "ArtistStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "rejectionReason"      TEXT,
  ADD COLUMN "submittedById"        TEXT,
  ADD COLUMN "verificationCode"     TEXT,
  ADD COLUMN "verificationProofUrl" TEXT;

-- Change listeners from INTEGER to BIGINT
ALTER TABLE "Artist" ALTER COLUMN "listeners" TYPE BIGINT;

-- Add submittedById foreign key reference (soft — no cascade, user may be deleted)
ALTER TABLE "Artist"
  ADD CONSTRAINT "Artist_submittedById_fkey"
  FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL;
