-- CreateServiceTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "professionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateGenreTable
CREATE TABLE "Genre" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Genre_pkey" PRIMARY KEY ("id")
);

-- CreateWorkFormatTable
CREATE TABLE "WorkFormat" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkFormat_pkey" PRIMARY KEY ("id")
);

-- CreateEmploymentTypeTable
CREATE TABLE "EmploymentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmploymentType_pkey" PRIMARY KEY ("id")
);

-- CreateSkillLevelTable
CREATE TABLE "SkillLevel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkillLevel_pkey" PRIMARY KEY ("id")
);

-- CreateAvailabilityTable
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateUserSearchProfileTable
CREATE TABLE "UserSearchProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT,
    "genreId" TEXT,
    "workFormatId" TEXT,
    "employmentTypeId" TEXT,
    "skillLevelId" TEXT,
    "availabilityId" TEXT,
    "pricePerHour" DOUBLE PRECISION,
    "pricePerEvent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserSearchProfile_pkey" PRIMARY KEY ("id")
);

-- AddRelations
ALTER TABLE "Service" ADD CONSTRAINT "Service_professionId_fkey" FOREIGN KEY ("professionId") REFERENCES "Profession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Genre" ADD CONSTRAINT "Genre_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserSearchProfile" ADD CONSTRAINT "UserSearchProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSearchProfile" ADD CONSTRAINT "UserSearchProfile_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserSearchProfile" ADD CONSTRAINT "UserSearchProfile_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserSearchProfile" ADD CONSTRAINT "UserSearchProfile_workFormatId_fkey" FOREIGN KEY ("workFormatId") REFERENCES "WorkFormat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserSearchProfile" ADD CONSTRAINT "UserSearchProfile_employmentTypeId_fkey" FOREIGN KEY ("employmentTypeId") REFERENCES "EmploymentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserSearchProfile" ADD CONSTRAINT "UserSearchProfile_skillLevelId_fkey" FOREIGN KEY ("skillLevelId") REFERENCES "SkillLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserSearchProfile" ADD CONSTRAINT "UserSearchProfile_availabilityId_fkey" FOREIGN KEY ("availabilityId") REFERENCES "Availability"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddUniqueConstraints
CREATE UNIQUE INDEX "Service_name_key" ON "Service"("name");
CREATE UNIQUE INDEX "Genre_name_key" ON "Genre"("name");
CREATE UNIQUE INDEX "WorkFormat_name_key" ON "WorkFormat"("name");
CREATE UNIQUE INDEX "EmploymentType_name_key" ON "EmploymentType"("name");
CREATE UNIQUE INDEX "SkillLevel_name_key" ON "SkillLevel"("name");
CREATE UNIQUE INDEX "Availability_name_key" ON "Availability"("name");
ALTER TABLE "UserSearchProfile" ADD CONSTRAINT "UserSearchProfile_userId_serviceId_genreId_key" UNIQUE ("userId", "serviceId", "genreId");

-- AddIndexes
CREATE INDEX "Service_professionId_idx" ON "Service"("professionId");
CREATE INDEX "Genre_serviceId_idx" ON "Genre"("serviceId");
CREATE INDEX "UserSearchProfile_userId_idx" ON "UserSearchProfile"("userId");
CREATE INDEX "UserSearchProfile_serviceId_idx" ON "UserSearchProfile"("serviceId");
CREATE INDEX "UserSearchProfile_genreId_idx" ON "UserSearchProfile"("genreId");
CREATE INDEX "UserSearchProfile_workFormatId_idx" ON "UserSearchProfile"("workFormatId");
CREATE INDEX "UserSearchProfile_employmentTypeId_idx" ON "UserSearchProfile"("employmentTypeId");
CREATE INDEX "UserSearchProfile_skillLevelId_idx" ON "UserSearchProfile"("skillLevelId");
CREATE INDEX "UserSearchProfile_availabilityId_idx" ON "UserSearchProfile"("availabilityId");
