-- ============ VACANCY CANDIDATE OFFERS ============
-- Persisted «Предложить вакансию» nudges, so the «Предложено» mark on a matched
-- candidate survives page reloads (and re-offering is suppressed).

CREATE TABLE "VacancyCandidateOffer" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VacancyCandidateOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VacancyCandidateOffer_vacancyId_candidateId_key" ON "VacancyCandidateOffer"("vacancyId", "candidateId");
CREATE INDEX "VacancyCandidateOffer_vacancyId_idx" ON "VacancyCandidateOffer"("vacancyId");

ALTER TABLE "VacancyCandidateOffer" ADD CONSTRAINT "VacancyCandidateOffer_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VacancyCandidateOffer" ADD CONSTRAINT "VacancyCandidateOffer_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
