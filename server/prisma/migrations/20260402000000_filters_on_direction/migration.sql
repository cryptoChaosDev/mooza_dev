-- Move filter configuration from Service to Direction

-- 1. Add allowedFilterTypes to Direction
ALTER TABLE "Direction" ADD COLUMN "allowedFilterTypes" TEXT[] NOT NULL DEFAULT '{}';

-- 2. Create Direction <-> CustomFilter junction table
CREATE TABLE "_DirectionCustomFilters" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_DirectionCustomFilters_A_fkey" FOREIGN KEY ("A") REFERENCES "CustomFilter"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_DirectionCustomFilters_B_fkey" FOREIGN KEY ("B") REFERENCES "Direction"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "_DirectionCustomFilters_AB_unique" ON "_DirectionCustomFilters"("A", "B");
CREATE INDEX "_DirectionCustomFilters_B_index" ON "_DirectionCustomFilters"("B");

-- 3. Drop old Service <-> CustomFilter junction table
DROP TABLE IF EXISTS "_ServiceCustomFilters";

-- 4. Remove allowedFilterTypes from Service
ALTER TABLE "Service" DROP COLUMN IF EXISTS "allowedFilterTypes";
