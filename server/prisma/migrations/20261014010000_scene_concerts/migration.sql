-- CreateTable
CREATE TABLE "Concert" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "artistId" TEXT,
    "title" TEXT NOT NULL,
    "type" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "hasTime" BOOLEAN NOT NULL DEFAULT true,
    "utcOffsetMin" INTEGER,
    "cityName" TEXT NOT NULL,
    "cityKey" TEXT NOT NULL,
    "venue" TEXT,
    "address" TEXT,
    "url" TEXT,
    "ticketUrl" TEXT,
    "imageUrl" TEXT,
    "priceFrom" INTEGER,
    "createdById" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Concert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Concert_cityKey_startsAt_idx" ON "Concert"("cityKey", "startsAt");

-- CreateIndex
CREATE INDEX "Concert_artistId_startsAt_idx" ON "Concert"("artistId", "startsAt");

-- CreateIndex
CREATE INDEX "Concert_startsAt_idx" ON "Concert"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Concert_source_externalId_key" ON "Concert"("source", "externalId");

-- AddForeignKey
ALTER TABLE "Concert" ADD CONSTRAINT "Concert_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concert" ADD CONSTRAINT "Concert_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

