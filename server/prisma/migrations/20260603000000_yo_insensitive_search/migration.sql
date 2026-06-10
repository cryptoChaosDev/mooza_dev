-- Make all search treat Cyrillic "е" and "ё" as the same letter.
-- Approach: STORED generated columns holding a normalized form of each searchable
-- text field (lowercased + "ё" mapped to "е"). Search queries target these *Norm
-- columns with a query that is normalized the same way in application code, so a
-- substring ILIKE becomes ё/е-insensitive. Original columns keep "ё" for display.

-- Users: every searchable text field.
ALTER TABLE "User" ADD COLUMN "firstNameNorm" text GENERATED ALWAYS AS (translate(lower(coalesce("firstName", '')), 'ё', 'е')) STORED;
ALTER TABLE "User" ADD COLUMN "lastNameNorm"  text GENERATED ALWAYS AS (translate(lower(coalesce("lastName", '')), 'ё', 'е')) STORED;
ALTER TABLE "User" ADD COLUMN "nicknameNorm"  text GENERATED ALWAYS AS (translate(lower(coalesce("nickname", '')), 'ё', 'е')) STORED;
ALTER TABLE "User" ADD COLUMN "bioNorm"       text GENERATED ALWAYS AS (translate(lower(coalesce("bio", '')), 'ё', 'е')) STORED;
ALTER TABLE "User" ADD COLUMN "cityNorm"      text GENERATED ALWAYS AS (translate(lower(coalesce("city", '')), 'ё', 'е')) STORED;
ALTER TABLE "User" ADD COLUMN "countryNorm"   text GENERATED ALWAYS AS (translate(lower(coalesce("country", '')), 'ё', 'е')) STORED;
ALTER TABLE "User" ADD COLUMN "emailNorm"     text GENERATED ALWAYS AS (translate(lower(coalesce("email", '')), 'ё', 'е')) STORED;

-- Artists, professions, services and the various reference catalogs (name-based).
ALTER TABLE "Artist"          ADD COLUMN "nameNorm" text GENERATED ALWAYS AS (translate(lower(coalesce("name", '')), 'ё', 'е')) STORED;
ALTER TABLE "Profession"      ADD COLUMN "nameNorm" text GENERATED ALWAYS AS (translate(lower(coalesce("name", '')), 'ё', 'е')) STORED;
ALTER TABLE "Service"         ADD COLUMN "nameNorm" text GENERATED ALWAYS AS (translate(lower(coalesce("name", '')), 'ё', 'е')) STORED;
ALTER TABLE "Direction"       ADD COLUMN "nameNorm" text GENERATED ALWAYS AS (translate(lower(coalesce("name", '')), 'ё', 'е')) STORED;
ALTER TABLE "FieldOfActivity" ADD COLUMN "nameNorm" text GENERATED ALWAYS AS (translate(lower(coalesce("name", '')), 'ё', 'е')) STORED;
ALTER TABLE "Genre"           ADD COLUMN "nameNorm" text GENERATED ALWAYS AS (translate(lower(coalesce("name", '')), 'ё', 'е')) STORED;
ALTER TABLE "WorkFormat"      ADD COLUMN "nameNorm" text GENERATED ALWAYS AS (translate(lower(coalesce("name", '')), 'ё', 'е')) STORED;
ALTER TABLE "EmploymentType"  ADD COLUMN "nameNorm" text GENERATED ALWAYS AS (translate(lower(coalesce("name", '')), 'ё', 'е')) STORED;
ALTER TABLE "SkillLevel"      ADD COLUMN "nameNorm" text GENERATED ALWAYS AS (translate(lower(coalesce("name", '')), 'ё', 'е')) STORED;
ALTER TABLE "Availability"    ADD COLUMN "nameNorm" text GENERATED ALWAYS AS (translate(lower(coalesce("name", '')), 'ё', 'е')) STORED;
ALTER TABLE "Geography"       ADD COLUMN "nameNorm" text GENERATED ALWAYS AS (translate(lower(coalesce("name", '')), 'ё', 'е')) STORED;
ALTER TABLE "UserService"     ADD COLUMN "nameNorm" text GENERATED ALWAYS AS (translate(lower(coalesce("name", '')), 'ё', 'е')) STORED;

-- Custom filter values and chat messages.
ALTER TABLE "CustomFilterValue" ADD COLUMN "valueNorm"   text GENERATED ALWAYS AS (translate(lower(coalesce("value", '')), 'ё', 'е')) STORED;
ALTER TABLE "Message"           ADD COLUMN "contentNorm" text GENERATED ALWAYS AS (translate(lower(coalesce("content", '')), 'ё', 'е')) STORED;
