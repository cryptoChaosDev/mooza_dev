-- Move serviceSetId from Profession to Direction

-- 1. Remove serviceSetId from Profession
ALTER TABLE "Profession" DROP CONSTRAINT IF EXISTS "Profession_serviceSetId_fkey";
DROP INDEX IF EXISTS "Profession_serviceSetId_idx";
ALTER TABLE "Profession" DROP COLUMN IF EXISTS "serviceSetId";

-- 2. Add serviceSetId to Direction
ALTER TABLE "Direction" ADD COLUMN "serviceSetId" TEXT;

ALTER TABLE "Direction"
  ADD CONSTRAINT "Direction_serviceSetId_fkey"
  FOREIGN KEY ("serviceSetId") REFERENCES "ServiceSet"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Direction_serviceSetId_idx" ON "Direction"("serviceSetId");
