-- Allow duplicate names in Direction and Profession
-- (uniqueness was only needed when parent FK was required; now hierarchy is managed in Structure tree)

ALTER TABLE "Direction" DROP CONSTRAINT IF EXISTS "Direction_name_key";
ALTER TABLE "Profession" DROP CONSTRAINT IF EXISTS "Profession_name_key";
