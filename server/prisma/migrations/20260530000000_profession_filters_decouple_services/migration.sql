-- Add implicit M2M join table for UserProfession <-> CustomFilterValue
CREATE TABLE "_CustomFilterValueToUserProfession" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_CustomFilterValueToUserProfession_A_fkey" FOREIGN KEY ("A") REFERENCES "CustomFilterValue"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_CustomFilterValueToUserProfession_B_fkey" FOREIGN KEY ("B") REFERENCES "UserProfession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "_CustomFilterValueToUserProfession_AB_unique" ON "_CustomFilterValueToUserProfession"("A", "B");
CREATE INDEX "_CustomFilterValueToUserProfession_B_index" ON "_CustomFilterValueToUserProfession"("B");

-- Remove Direction-Service M2M join table (if it exists)
DROP TABLE IF EXISTS "_DirectionServices";
