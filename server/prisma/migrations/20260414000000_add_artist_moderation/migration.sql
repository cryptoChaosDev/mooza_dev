-- Add ArtistStatus enum (safe — skip if already exists)
DO $$ BEGIN
  CREATE TYPE "ArtistStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'VERIFIED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add moderation columns to Artist (safe — skip each if already exists)
DO $$ BEGIN
  ALTER TABLE "Artist" ADD COLUMN "status" "ArtistStatus" NOT NULL DEFAULT 'DRAFT';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Artist" ADD COLUMN "rejectionReason" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Artist" ADD COLUMN "submittedById" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Artist" ADD COLUMN "verificationCode" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Artist" ADD COLUMN "verificationProofUrl" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Change listeners from INTEGER to BIGINT (safe — already BIGINT is a no-op)
ALTER TABLE "Artist" ALTER COLUMN "listeners" TYPE BIGINT;

-- Add submittedById foreign key (safe — skip if already exists)
DO $$ BEGIN
  ALTER TABLE "Artist"
    ADD CONSTRAINT "Artist_submittedById_fkey"
    FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
