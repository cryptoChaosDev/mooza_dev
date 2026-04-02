-- Move from Service.directionId to ServiceSet model

-- 1. Create ServiceSet table
CREATE TABLE "ServiceSet" (
  "id"        TEXT         NOT NULL,
  "name"      TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceSet_pkey"      PRIMARY KEY ("id"),
  CONSTRAINT "ServiceSet_name_key"  UNIQUE ("name")
);

-- 2. For each Direction that has services, create a ServiceSet
INSERT INTO "ServiceSet" ("id", "name", "createdAt")
SELECT gen_random_uuid()::text, d."name", NOW()
FROM "Direction" d
WHERE EXISTS (SELECT 1 FROM "Service" s WHERE s."directionId" = d."id")
ON CONFLICT ("name") DO NOTHING;

-- 3. Add serviceSetId to Service (nullable first)
ALTER TABLE "Service" ADD COLUMN "serviceSetId" TEXT;

-- 4. Populate serviceSetId from directionId → ServiceSet
UPDATE "Service" s
SET "serviceSetId" = ss."id"
FROM "ServiceSet" ss
JOIN "Direction" d ON d."name" = ss."name"
WHERE s."directionId" = d."id";

-- 5. Delete services that have no matching direction (orphans)
DELETE FROM "Service" WHERE "serviceSetId" IS NULL;

-- 6. Make serviceSetId required
ALTER TABLE "Service" ALTER COLUMN "serviceSetId" SET NOT NULL;

-- 7. Drop old global uniqueness on name (now unique per set)
ALTER TABLE "Service" DROP CONSTRAINT IF EXISTS "Service_name_key";

-- 8. Drop old directionId FK and column
ALTER TABLE "Service" DROP CONSTRAINT IF EXISTS "Service_directionId_fkey";
ALTER TABLE "Service" DROP COLUMN IF EXISTS "directionId";
DROP INDEX IF EXISTS "Service_directionId_idx";

-- 9. Add FK for serviceSetId
ALTER TABLE "Service"
  ADD CONSTRAINT "Service_serviceSetId_fkey"
  FOREIGN KEY ("serviceSetId") REFERENCES "ServiceSet"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Service_name_serviceSetId_key" ON "Service"("name", "serviceSetId");
CREATE INDEX "Service_serviceSetId_idx" ON "Service"("serviceSetId");

-- 10. Add serviceSetId to Profession (nullable)
ALTER TABLE "Profession" ADD COLUMN "serviceSetId" TEXT;

ALTER TABLE "Profession"
  ADD CONSTRAINT "Profession_serviceSetId_fkey"
  FOREIGN KEY ("serviceSetId") REFERENCES "ServiceSet"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Profession_serviceSetId_idx" ON "Profession"("serviceSetId");

-- 11. Drop nameEn from Service (cleanup)
ALTER TABLE "Service" DROP COLUMN IF EXISTS "nameEn";
