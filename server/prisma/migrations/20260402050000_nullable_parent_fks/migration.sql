-- Make Direction.fieldOfActivityId nullable (standalone reference item)
ALTER TABLE "Direction" DROP CONSTRAINT IF EXISTS "Direction_fieldOfActivityId_fkey";
ALTER TABLE "Direction" ALTER COLUMN "fieldOfActivityId" DROP NOT NULL;
ALTER TABLE "Direction" ADD CONSTRAINT "Direction_fieldOfActivityId_fkey"
  FOREIGN KEY ("fieldOfActivityId") REFERENCES "FieldOfActivity"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Replace composite unique with simple name unique on Direction
ALTER TABLE "Direction" DROP CONSTRAINT IF EXISTS "Direction_name_fieldOfActivityId_key";
ALTER TABLE "Direction" ADD CONSTRAINT "Direction_name_key" UNIQUE ("name");

-- Make Profession.directionId nullable (standalone reference item)
ALTER TABLE "Profession" DROP CONSTRAINT IF EXISTS "Profession_directionId_fkey";
ALTER TABLE "Profession" ALTER COLUMN "directionId" DROP NOT NULL;
ALTER TABLE "Profession" ADD CONSTRAINT "Profession_directionId_fkey"
  FOREIGN KEY ("directionId") REFERENCES "Direction"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Replace composite unique with simple name unique on Profession
ALTER TABLE "Profession" DROP CONSTRAINT IF EXISTS "Profession_name_directionId_key";
ALTER TABLE "Profession" ADD CONSTRAINT "Profession_name_key" UNIQUE ("name");
