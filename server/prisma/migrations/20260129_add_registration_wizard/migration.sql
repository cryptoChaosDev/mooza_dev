-- CreateTable
CREATE TABLE "FieldOfActivity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldOfActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profession" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fieldOfActivityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Profession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionFeature" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Artist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inn" TEXT,
    "ogrn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "professionId" TEXT NOT NULL,
    "features" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserProfession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserArtist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserArtist_pkey" PRIMARY KEY ("id")
);

-- AlterTable User - add new fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "nickname" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fieldOfActivityId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "employerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "FieldOfActivity_name_key" ON "FieldOfActivity"("name");

-- CreateIndex
CREATE INDEX "Profession_fieldOfActivityId_idx" ON "Profession"("fieldOfActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "Profession_name_fieldOfActivityId_key" ON "Profession"("name", "fieldOfActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionFeature_name_key" ON "ProfessionFeature"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Artist_name_key" ON "Artist"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Employer_inn_key" ON "Employer"("inn");

-- CreateIndex
CREATE UNIQUE INDEX "Employer_ogrn_key" ON "Employer"("ogrn");

-- CreateIndex
CREATE INDEX "UserProfession_userId_idx" ON "UserProfession"("userId");

-- CreateIndex
CREATE INDEX "UserProfession_professionId_idx" ON "UserProfession"("professionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfession_userId_professionId_key" ON "UserProfession"("userId", "professionId");

-- CreateIndex
CREATE INDEX "UserArtist_userId_idx" ON "UserArtist"("userId");

-- CreateIndex
CREATE INDEX "UserArtist_artistId_idx" ON "UserArtist"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "UserArtist_userId_artistId_key" ON "UserArtist"("userId", "artistId");

-- CreateIndex
CREATE INDEX "User_fieldOfActivityId_idx" ON "User"("fieldOfActivityId");

-- AddForeignKey
ALTER TABLE "Profession" ADD CONSTRAINT "Profession_fieldOfActivityId_fkey" FOREIGN KEY ("fieldOfActivityId") REFERENCES "FieldOfActivity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfession" ADD CONSTRAINT "UserProfession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfession" ADD CONSTRAINT "UserProfession_professionId_fkey" FOREIGN KEY ("professionId") REFERENCES "Profession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserArtist" ADD CONSTRAINT "UserArtist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserArtist" ADD CONSTRAINT "UserArtist_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_fieldOfActivityId_fkey" FOREIGN KEY ("fieldOfActivityId") REFERENCES "FieldOfActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
