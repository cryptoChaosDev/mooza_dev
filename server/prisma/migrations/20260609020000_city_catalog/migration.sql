-- Controlled city catalog for profile/registration.
CREATE TABLE "City" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "country"   TEXT NOT NULL DEFAULT 'Россия',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "City_name_key" ON "City"("name");
CREATE INDEX "City_sortOrder_idx" ON "City"("sortOrder");
