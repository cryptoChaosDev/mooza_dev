-- Migration: Add UserService model, drop UserSearchProfile
-- UserService replaces both UserProfession (profession selection) and
-- UserSearchProfile (flat filter axes) with a hierarchical per-service model.

-- ============ Step 1: Drop old UserSearchProfile M2M join tables ============

DROP TABLE IF EXISTS "_AvailabilityToUserSearchProfile";
DROP TABLE IF EXISTS "_EmploymentTypeToUserSearchProfile";
DROP TABLE IF EXISTS "_GenreToUserSearchProfile";
DROP TABLE IF EXISTS "_GeographyToUserSearchProfile";
DROP TABLE IF EXISTS "_PriceRangeToUserSearchProfile";
DROP TABLE IF EXISTS "_ServiceToUserSearchProfile";
DROP TABLE IF EXISTS "_SkillLevelToUserSearchProfile";
DROP TABLE IF EXISTS "_UserSearchProfileToWorkFormat";

-- ============ Step 2: Drop old UserSearchProfile table ============

DROP TABLE IF EXISTS "UserSearchProfile";

-- ============ Step 3: Create UserService table ============

CREATE TABLE "UserService" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "professionId" TEXT NOT NULL,
    "serviceId"    TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserService_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserService_userId_serviceId_key" ON "UserService"("userId", "serviceId");
CREATE INDEX "UserService_userId_idx"       ON "UserService"("userId");
CREATE INDEX "UserService_professionId_idx" ON "UserService"("professionId");
CREATE INDEX "UserService_serviceId_idx"    ON "UserService"("serviceId");

ALTER TABLE "UserService"
    ADD CONSTRAINT "UserService_userId_fkey"       FOREIGN KEY ("userId")       REFERENCES "User"("id")       ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "UserService_professionId_fkey" FOREIGN KEY ("professionId") REFERENCES "Profession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "UserService_serviceId_fkey"    FOREIGN KEY ("serviceId")    REFERENCES "Service"("id")    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============ Step 4: Create M2M join tables for UserService ============
-- Prisma implicit M2M naming: alphabetical sort of the two model names
-- A < U: Availability, EmploymentType, Genre, Geography, PriceRange, Service, SkillLevel
-- U < W: WorkFormat

-- Availability ↔ UserService  (A < U)
CREATE TABLE "_AvailabilityToUserService" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_AvailabilityToUserService_AB_unique" ON "_AvailabilityToUserService"("A", "B");
CREATE INDEX "_AvailabilityToUserService_B_index" ON "_AvailabilityToUserService"("B");
ALTER TABLE "_AvailabilityToUserService"
    ADD CONSTRAINT "_AvailabilityToUserService_A_fkey" FOREIGN KEY ("A") REFERENCES "Availability"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "_AvailabilityToUserService_B_fkey" FOREIGN KEY ("B") REFERENCES "UserService"("id")  ON DELETE CASCADE ON UPDATE CASCADE;

-- EmploymentType ↔ UserService  (E < U)
CREATE TABLE "_EmploymentTypeToUserService" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_EmploymentTypeToUserService_AB_unique" ON "_EmploymentTypeToUserService"("A", "B");
CREATE INDEX "_EmploymentTypeToUserService_B_index" ON "_EmploymentTypeToUserService"("B");
ALTER TABLE "_EmploymentTypeToUserService"
    ADD CONSTRAINT "_EmploymentTypeToUserService_A_fkey" FOREIGN KEY ("A") REFERENCES "EmploymentType"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "_EmploymentTypeToUserService_B_fkey" FOREIGN KEY ("B") REFERENCES "UserService"("id")    ON DELETE CASCADE ON UPDATE CASCADE;

-- Genre ↔ UserService  (G < U)
CREATE TABLE "_GenreToUserService" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_GenreToUserService_AB_unique" ON "_GenreToUserService"("A", "B");
CREATE INDEX "_GenreToUserService_B_index" ON "_GenreToUserService"("B");
ALTER TABLE "_GenreToUserService"
    ADD CONSTRAINT "_GenreToUserService_A_fkey" FOREIGN KEY ("A") REFERENCES "Genre"("id")      ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "_GenreToUserService_B_fkey" FOREIGN KEY ("B") REFERENCES "UserService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Geography ↔ UserService  (G < U)
CREATE TABLE "_GeographyToUserService" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_GeographyToUserService_AB_unique" ON "_GeographyToUserService"("A", "B");
CREATE INDEX "_GeographyToUserService_B_index" ON "_GeographyToUserService"("B");
ALTER TABLE "_GeographyToUserService"
    ADD CONSTRAINT "_GeographyToUserService_A_fkey" FOREIGN KEY ("A") REFERENCES "Geography"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "_GeographyToUserService_B_fkey" FOREIGN KEY ("B") REFERENCES "UserService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PriceRange ↔ UserService  (P < U)
CREATE TABLE "_PriceRangeToUserService" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_PriceRangeToUserService_AB_unique" ON "_PriceRangeToUserService"("A", "B");
CREATE INDEX "_PriceRangeToUserService_B_index" ON "_PriceRangeToUserService"("B");
ALTER TABLE "_PriceRangeToUserService"
    ADD CONSTRAINT "_PriceRangeToUserService_A_fkey" FOREIGN KEY ("A") REFERENCES "PriceRange"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "_PriceRangeToUserService_B_fkey" FOREIGN KEY ("B") REFERENCES "UserService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Note: Service↔UserService and Profession↔UserService are direct FKs (not M2M),
-- handled by the serviceId and professionId columns on UserService already created above.

-- SkillLevel ↔ UserService  (S < U)
CREATE TABLE "_SkillLevelToUserService" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_SkillLevelToUserService_AB_unique" ON "_SkillLevelToUserService"("A", "B");
CREATE INDEX "_SkillLevelToUserService_B_index" ON "_SkillLevelToUserService"("B");
ALTER TABLE "_SkillLevelToUserService"
    ADD CONSTRAINT "_SkillLevelToUserService_A_fkey" FOREIGN KEY ("A") REFERENCES "SkillLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "_SkillLevelToUserService_B_fkey" FOREIGN KEY ("B") REFERENCES "UserService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- UserService ↔ WorkFormat  (U < W) — "A" is UserService, "B" is WorkFormat
CREATE TABLE "_UserServiceToWorkFormat" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_UserServiceToWorkFormat_AB_unique" ON "_UserServiceToWorkFormat"("A", "B");
CREATE INDEX "_UserServiceToWorkFormat_B_index" ON "_UserServiceToWorkFormat"("B");
ALTER TABLE "_UserServiceToWorkFormat"
    ADD CONSTRAINT "_UserServiceToWorkFormat_A_fkey" FOREIGN KEY ("A") REFERENCES "UserService"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "_UserServiceToWorkFormat_B_fkey" FOREIGN KEY ("B") REFERENCES "WorkFormat"("id")  ON DELETE CASCADE ON UPDATE CASCADE;
