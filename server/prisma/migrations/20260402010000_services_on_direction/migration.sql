-- Move Service.professionId → Service.directionId

-- 1. Add new column (nullable first)
ALTER TABLE "Service" ADD COLUMN "directionId" TEXT;

-- 2. Populate from the profession's directionId
UPDATE "Service" s
SET "directionId" = p."directionId"
FROM "Profession" p
WHERE s."professionId" = p."id";

-- 3. For any orphaned rows (no matching profession), delete them
DELETE FROM "Service" WHERE "directionId" IS NULL;

-- 4. Make column required
ALTER TABLE "Service" ALTER COLUMN "directionId" SET NOT NULL;

-- 5. Add FK constraint to Direction (with cascade)
ALTER TABLE "Service"
  ADD CONSTRAINT "Service_directionId_fkey"
  FOREIGN KEY ("directionId") REFERENCES "Direction"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Drop old FK constraint and column
ALTER TABLE "Service" DROP CONSTRAINT "Service_professionId_fkey";
ALTER TABLE "Service" DROP COLUMN "professionId";

-- 7. Add index on directionId
CREATE INDEX "Service_directionId_idx" ON "Service"("directionId");
