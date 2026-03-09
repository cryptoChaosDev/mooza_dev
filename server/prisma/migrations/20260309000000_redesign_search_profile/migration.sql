-- Migration: Redesign search profile
-- Changes:
--   1. Genre: drop serviceId dependency, add sortOrder → becomes independent
--   2. UserSearchProfile: replace scalar FK columns with implicit M2M join tables
--      one profile per user (userId UNIQUE), remove pricePerHour/pricePerEvent
--   3. Add Geography table
--   4. Add PriceRange table

-- ============ Step 1: Drop old UserSearchProfile constraints & FK columns ============

ALTER TABLE "UserSearchProfile" DROP CONSTRAINT IF EXISTS "UserSearchProfile_userId_serviceId_genreId_key";
DROP INDEX IF EXISTS "UserSearchProfile_serviceId_idx";
DROP INDEX IF EXISTS "UserSearchProfile_genreId_idx";
DROP INDEX IF EXISTS "UserSearchProfile_workFormatId_idx";
DROP INDEX IF EXISTS "UserSearchProfile_employmentTypeId_idx";
DROP INDEX IF EXISTS "UserSearchProfile_skillLevelId_idx";
DROP INDEX IF EXISTS "UserSearchProfile_availabilityId_idx";

ALTER TABLE "UserSearchProfile" DROP CONSTRAINT IF EXISTS "UserSearchProfile_serviceId_fkey";
ALTER TABLE "UserSearchProfile" DROP CONSTRAINT IF EXISTS "UserSearchProfile_genreId_fkey";
ALTER TABLE "UserSearchProfile" DROP CONSTRAINT IF EXISTS "UserSearchProfile_workFormatId_fkey";
ALTER TABLE "UserSearchProfile" DROP CONSTRAINT IF EXISTS "UserSearchProfile_employmentTypeId_fkey";
ALTER TABLE "UserSearchProfile" DROP CONSTRAINT IF EXISTS "UserSearchProfile_skillLevelId_fkey";
ALTER TABLE "UserSearchProfile" DROP CONSTRAINT IF EXISTS "UserSearchProfile_availabilityId_fkey";

ALTER TABLE "UserSearchProfile" DROP COLUMN IF EXISTS "serviceId";
ALTER TABLE "UserSearchProfile" DROP COLUMN IF EXISTS "genreId";
ALTER TABLE "UserSearchProfile" DROP COLUMN IF EXISTS "workFormatId";
ALTER TABLE "UserSearchProfile" DROP COLUMN IF EXISTS "employmentTypeId";
ALTER TABLE "UserSearchProfile" DROP COLUMN IF EXISTS "skillLevelId";
ALTER TABLE "UserSearchProfile" DROP COLUMN IF EXISTS "availabilityId";
ALTER TABLE "UserSearchProfile" DROP COLUMN IF EXISTS "pricePerHour";
ALTER TABLE "UserSearchProfile" DROP COLUMN IF EXISTS "pricePerEvent";

-- One profile per user
ALTER TABLE "UserSearchProfile" ADD CONSTRAINT "UserSearchProfile_userId_key" UNIQUE ("userId");

-- ============ Step 2: Fix Genre table ============

ALTER TABLE "Genre" DROP CONSTRAINT IF EXISTS "Genre_serviceId_fkey";
DROP INDEX IF EXISTS "Genre_serviceId_idx";
ALTER TABLE "Genre" DROP COLUMN IF EXISTS "serviceId";
ALTER TABLE "Genre" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- ============ Step 3: Create Geography table ============

CREATE TABLE "Geography" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Geography_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Geography_name_key" ON "Geography"("name");

-- ============ Step 4: Create PriceRange table ============

CREATE TABLE "PriceRange" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "minValue" INTEGER,
    "maxValue" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceRange_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PriceRange_name_key" ON "PriceRange"("name");

-- ============ Step 5: Create implicit M2M join tables ============

-- Availability ↔ UserSearchProfile
CREATE TABLE "_AvailabilityToUserSearchProfile" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_AvailabilityToUserSearchProfile_AB_unique" ON "_AvailabilityToUserSearchProfile"("A", "B");
CREATE INDEX "_AvailabilityToUserSearchProfile_B_index" ON "_AvailabilityToUserSearchProfile"("B");
ALTER TABLE "_AvailabilityToUserSearchProfile"
    ADD CONSTRAINT "_AvailabilityToUserSearchProfile_A_fkey" FOREIGN KEY ("A") REFERENCES "Availability"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "_AvailabilityToUserSearchProfile_B_fkey" FOREIGN KEY ("B") REFERENCES "UserSearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EmploymentType ↔ UserSearchProfile
CREATE TABLE "_EmploymentTypeToUserSearchProfile" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_EmploymentTypeToUserSearchProfile_AB_unique" ON "_EmploymentTypeToUserSearchProfile"("A", "B");
CREATE INDEX "_EmploymentTypeToUserSearchProfile_B_index" ON "_EmploymentTypeToUserSearchProfile"("B");
ALTER TABLE "_EmploymentTypeToUserSearchProfile"
    ADD CONSTRAINT "_EmploymentTypeToUserSearchProfile_A_fkey" FOREIGN KEY ("A") REFERENCES "EmploymentType"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "_EmploymentTypeToUserSearchProfile_B_fkey" FOREIGN KEY ("B") REFERENCES "UserSearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Genre ↔ UserSearchProfile
CREATE TABLE "_GenreToUserSearchProfile" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_GenreToUserSearchProfile_AB_unique" ON "_GenreToUserSearchProfile"("A", "B");
CREATE INDEX "_GenreToUserSearchProfile_B_index" ON "_GenreToUserSearchProfile"("B");
ALTER TABLE "_GenreToUserSearchProfile"
    ADD CONSTRAINT "_GenreToUserSearchProfile_A_fkey" FOREIGN KEY ("A") REFERENCES "Genre"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "_GenreToUserSearchProfile_B_fkey" FOREIGN KEY ("B") REFERENCES "UserSearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Geography ↔ UserSearchProfile
CREATE TABLE "_GeographyToUserSearchProfile" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_GeographyToUserSearchProfile_AB_unique" ON "_GeographyToUserSearchProfile"("A", "B");
CREATE INDEX "_GeographyToUserSearchProfile_B_index" ON "_GeographyToUserSearchProfile"("B");
ALTER TABLE "_GeographyToUserSearchProfile"
    ADD CONSTRAINT "_GeographyToUserSearchProfile_A_fkey" FOREIGN KEY ("A") REFERENCES "Geography"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "_GeographyToUserSearchProfile_B_fkey" FOREIGN KEY ("B") REFERENCES "UserSearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PriceRange ↔ UserSearchProfile
CREATE TABLE "_PriceRangeToUserSearchProfile" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_PriceRangeToUserSearchProfile_AB_unique" ON "_PriceRangeToUserSearchProfile"("A", "B");
CREATE INDEX "_PriceRangeToUserSearchProfile_B_index" ON "_PriceRangeToUserSearchProfile"("B");
ALTER TABLE "_PriceRangeToUserSearchProfile"
    ADD CONSTRAINT "_PriceRangeToUserSearchProfile_A_fkey" FOREIGN KEY ("A") REFERENCES "PriceRange"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "_PriceRangeToUserSearchProfile_B_fkey" FOREIGN KEY ("B") REFERENCES "UserSearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Service ↔ UserSearchProfile
CREATE TABLE "_ServiceToUserSearchProfile" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_ServiceToUserSearchProfile_AB_unique" ON "_ServiceToUserSearchProfile"("A", "B");
CREATE INDEX "_ServiceToUserSearchProfile_B_index" ON "_ServiceToUserSearchProfile"("B");
ALTER TABLE "_ServiceToUserSearchProfile"
    ADD CONSTRAINT "_ServiceToUserSearchProfile_A_fkey" FOREIGN KEY ("A") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "_ServiceToUserSearchProfile_B_fkey" FOREIGN KEY ("B") REFERENCES "UserSearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SkillLevel ↔ UserSearchProfile
CREATE TABLE "_SkillLevelToUserSearchProfile" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_SkillLevelToUserSearchProfile_AB_unique" ON "_SkillLevelToUserSearchProfile"("A", "B");
CREATE INDEX "_SkillLevelToUserSearchProfile_B_index" ON "_SkillLevelToUserSearchProfile"("B");
ALTER TABLE "_SkillLevelToUserSearchProfile"
    ADD CONSTRAINT "_SkillLevelToUserSearchProfile_A_fkey" FOREIGN KEY ("A") REFERENCES "SkillLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "_SkillLevelToUserSearchProfile_B_fkey" FOREIGN KEY ("B") REFERENCES "UserSearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- UserSearchProfile ↔ WorkFormat (U < W alphabetically)
CREATE TABLE "_UserSearchProfileToWorkFormat" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_UserSearchProfileToWorkFormat_AB_unique" ON "_UserSearchProfileToWorkFormat"("A", "B");
CREATE INDEX "_UserSearchProfileToWorkFormat_B_index" ON "_UserSearchProfileToWorkFormat"("B");
ALTER TABLE "_UserSearchProfileToWorkFormat"
    ADD CONSTRAINT "_UserSearchProfileToWorkFormat_A_fkey" FOREIGN KEY ("A") REFERENCES "UserSearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "_UserSearchProfileToWorkFormat_B_fkey" FOREIGN KEY ("B") REFERENCES "WorkFormat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
