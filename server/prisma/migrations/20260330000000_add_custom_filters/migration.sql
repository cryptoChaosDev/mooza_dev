-- CreateTable
CREATE TABLE "CustomFilter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomFilter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFilterValue" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "filterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomFilterValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomFilterValue_filterId_idx" ON "CustomFilterValue"("filterId");

-- AddForeignKey
ALTER TABLE "CustomFilterValue" ADD CONSTRAINT "CustomFilterValue_filterId_fkey"
    FOREIGN KEY ("filterId") REFERENCES "CustomFilter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
