-- Pro-account foundation: time-based Pro, donation codes, feed presets.

-- Effective Pro = isPro (manual admin override) OR proUntil > now().
ALTER TABLE "User" ADD COLUMN "proUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "proMonthsFromReferrals" INTEGER NOT NULL DEFAULT 0;

-- Donation lifecycle.
DO $$ BEGIN
  CREATE TYPE "DonationStatus" AS ENUM ('CREATED', 'PAID', 'ACTIVATED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE "DonationCode" (
  "id"          TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "status"      "DonationStatus" NOT NULL DEFAULT 'CREATED',
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "amount"      INTEGER,
  "note"        TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt"      TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  CONSTRAINT "DonationCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DonationCode_code_key" ON "DonationCode"("code");
CREATE INDEX "DonationCode_userId_idx" ON "DonationCode"("userId");
CREATE INDEX "DonationCode_code_idx" ON "DonationCode"("code");
CREATE INDEX "DonationCode_status_idx" ON "DonationCode"("status");
ALTER TABLE "DonationCode" ADD CONSTRAINT "DonationCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Saved feed-filter presets.
CREATE TABLE "FeedPreset" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "filters"   JSONB NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedPreset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FeedPreset_userId_idx" ON "FeedPreset"("userId");
ALTER TABLE "FeedPreset" ADD CONSTRAINT "FeedPreset_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
