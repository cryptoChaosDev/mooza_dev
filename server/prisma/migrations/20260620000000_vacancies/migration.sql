-- ============ VACANCIES ============
-- Artist-owned hiring posts mirroring orders, but keyed on a profession (not a
-- service) and matched by profession + profession filters. titleNorm is a STORED
-- generated column (ё→е, lower) for ё/е-insensitive search — NEVER applied via
-- `prisma db push` (it would drop the GENERATED expression and silently empty
-- the search). Only `prisma migrate deploy`.

-- CreateTable: Vacancy (without titleNorm; added as GENERATED below)
CREATE TABLE "Vacancy" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "professionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "workFormat" TEXT NOT NULL,
    "geography" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL,
    "paymentType" TEXT NOT NULL,
    "compensation" INTEGER,
    "description" TEXT,
    "requireComment" BOOLEAN NOT NULL DEFAULT false,
    "requirePortfolio" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vacancy_pkey" PRIMARY KEY ("id")
);

-- Generated normalized title (ё→е, lower) for search — matches the *Norm pattern.
ALTER TABLE "Vacancy" ADD COLUMN "titleNorm" text GENERATED ALWAYS AS (translate(lower(coalesce("title", '')), 'ё', 'е')) STORED;

-- CreateIndex
CREATE INDEX "Vacancy_artistId_idx" ON "Vacancy"("artistId");
CREATE INDEX "Vacancy_authorId_idx" ON "Vacancy"("authorId");
CREATE INDEX "Vacancy_professionId_idx" ON "Vacancy"("professionId");
CREATE INDEX "Vacancy_status_idx" ON "Vacancy"("status");

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_professionId_fkey" FOREIGN KEY ("professionId") REFERENCES "Profession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: VacancyResponse
CREATE TABLE "VacancyResponse" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VacancyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VacancyResponse_vacancyId_idx" ON "VacancyResponse"("vacancyId");
CREATE UNIQUE INDEX "VacancyResponse_vacancyId_applicantId_key" ON "VacancyResponse"("vacancyId", "applicantId");

-- AddForeignKey
ALTER TABLE "VacancyResponse" ADD CONSTRAINT "VacancyResponse_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VacancyResponse" ADD CONSTRAINT "VacancyResponse_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: VacancyOffer
CREATE TABLE "VacancyOffer" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "conditions" TEXT NOT NULL,
    "compensation" TEXT NOT NULL,
    "extraDetails" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VacancyOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VacancyOffer_vacancyId_idx" ON "VacancyOffer"("vacancyId");
CREATE INDEX "VacancyOffer_applicantId_idx" ON "VacancyOffer"("applicantId");

-- AddForeignKey
ALTER TABLE "VacancyOffer" ADD CONSTRAINT "VacancyOffer_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VacancyOffer" ADD CONSTRAINT "VacancyOffer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "VacancyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VacancyOffer" ADD CONSTRAINT "VacancyOffer_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: VacancyReferenceFile
CREATE TABLE "VacancyReferenceFile" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VacancyReferenceFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VacancyReferenceFile_vacancyId_idx" ON "VacancyReferenceFile"("vacancyId");

-- AddForeignKey
ALTER TABLE "VacancyReferenceFile" ADD CONSTRAINT "VacancyReferenceFile_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: VacancyReferenceLink
CREATE TABLE "VacancyReferenceLink" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VacancyReferenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VacancyReferenceLink_vacancyId_idx" ON "VacancyReferenceLink"("vacancyId");

-- AddForeignKey
ALTER TABLE "VacancyReferenceLink" ADD CONSTRAINT "VacancyReferenceLink_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: VacancyResponseFile
CREATE TABLE "VacancyResponseFile" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VacancyResponseFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VacancyResponseFile_responseId_idx" ON "VacancyResponseFile"("responseId");

-- AddForeignKey
ALTER TABLE "VacancyResponseFile" ADD CONSTRAINT "VacancyResponseFile_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "VacancyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: VacancyResponseLink
CREATE TABLE "VacancyResponseLink" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VacancyResponseLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VacancyResponseLink_responseId_idx" ON "VacancyResponseLink"("responseId");

-- AddForeignKey
ALTER TABLE "VacancyResponseLink" ADD CONSTRAINT "VacancyResponseLink_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "VacancyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: implicit M2M between CustomFilterValue and Vacancy (Prisma convention:
-- alphabetical, so table = _CustomFilterValueToVacancy, A=CustomFilterValue, B=Vacancy).
CREATE TABLE "_CustomFilterValueToVacancy" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_CustomFilterValueToVacancy_AB_unique" ON "_CustomFilterValueToVacancy"("A", "B");
CREATE INDEX "_CustomFilterValueToVacancy_B_index" ON "_CustomFilterValueToVacancy"("B");

-- AddForeignKey
ALTER TABLE "_CustomFilterValueToVacancy" ADD CONSTRAINT "_CustomFilterValueToVacancy_A_fkey" FOREIGN KEY ("A") REFERENCES "CustomFilterValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_CustomFilterValueToVacancy" ADD CONSTRAINT "_CustomFilterValueToVacancy_B_fkey" FOREIGN KEY ("B") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Link posts to the vacancy they advertise (type='vacancy'); SET NULL so deleting a
-- vacancy leaves its feed post orphaned-but-intact (consistent with orderId).
ALTER TABLE "Post" ADD COLUMN "vacancyId" TEXT;
CREATE INDEX "Post_vacancyId_idx" ON "Post"("vacancyId");
ALTER TABLE "Post" ADD CONSTRAINT "Post_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
