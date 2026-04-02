-- Replace ServiceSet model with direct M2M between Direction and Service

-- 1. Create M2M join table (Prisma implicit: A=Direction, B=Service alphabetically)
CREATE TABLE "_DirectionServices" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_DirectionServices_AB_unique" ON "_DirectionServices"("A", "B");
CREATE INDEX "_DirectionServices_B_index" ON "_DirectionServices"("B");
ALTER TABLE "_DirectionServices"
  ADD CONSTRAINT "_DirectionServices_A_fkey"
  FOREIGN KEY ("A") REFERENCES "Direction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_DirectionServices"
  ADD CONSTRAINT "_DirectionServices_B_fkey"
  FOREIGN KEY ("B") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Migrate existing data: direction → serviceSet → services → join table
INSERT INTO "_DirectionServices" ("A", "B")
SELECT d."id", s."id"
FROM "Direction" d
JOIN "ServiceSet" ss ON ss."id" = d."serviceSetId"
JOIN "Service" s ON s."serviceSetId" = ss."id"
WHERE d."serviceSetId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. Remove serviceSetId from Direction
ALTER TABLE "Direction" DROP CONSTRAINT IF EXISTS "Direction_serviceSetId_fkey";
DROP INDEX IF EXISTS "Direction_serviceSetId_idx";
ALTER TABLE "Direction" DROP COLUMN IF EXISTS "serviceSetId";

-- 4. Remove serviceSetId from Service; fix unique constraint
ALTER TABLE "Service" DROP CONSTRAINT IF EXISTS "Service_serviceSetId_fkey";
DROP INDEX IF EXISTS "Service_serviceSetId_idx";
ALTER TABLE "Service" DROP CONSTRAINT IF EXISTS "Service_name_serviceSetId_key";
ALTER TABLE "Service" DROP COLUMN IF EXISTS "serviceSetId";

-- Deduplicate service names before adding unique constraint
DELETE FROM "Service" s1 USING "Service" s2
  WHERE s1.id > s2.id AND s1.name = s2.name;

ALTER TABLE "Service" ADD CONSTRAINT "Service_name_key" UNIQUE ("name");

-- 5. Drop ServiceSet table
DROP TABLE IF EXISTS "ServiceSet";
