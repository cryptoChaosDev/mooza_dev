CREATE TABLE "Section" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Section_name_key" ON "Section"("name");

ALTER TABLE "Service" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Service" ADD COLUMN "sectionId" TEXT;
CREATE INDEX "Service_sectionId_idx" ON "Service"("sectionId");
ALTER TABLE "Service" ADD CONSTRAINT "Service_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ServiceProfession" (
  "serviceId" TEXT NOT NULL,
  "professionId" TEXT NOT NULL,
  CONSTRAINT "ServiceProfession_pkey" PRIMARY KEY ("serviceId","professionId")
);
CREATE INDEX "ServiceProfession_professionId_idx" ON "ServiceProfession"("professionId");
ALTER TABLE "ServiceProfession" ADD CONSTRAINT "ServiceProfession_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceProfession" ADD CONSTRAINT "ServiceProfession_professionId_fkey" FOREIGN KEY ("professionId") REFERENCES "Profession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomFilter" ADD COLUMN "serviceId" TEXT;
CREATE INDEX "CustomFilter_serviceId_idx" ON "CustomFilter"("serviceId");
CREATE UNIQUE INDEX "CustomFilter_name_serviceId_key" ON "CustomFilter"("name","serviceId");
ALTER TABLE "CustomFilter" ADD CONSTRAINT "CustomFilter_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
