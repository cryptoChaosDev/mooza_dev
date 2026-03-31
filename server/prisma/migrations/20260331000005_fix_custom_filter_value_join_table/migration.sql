-- Drop incorrectly named table from previous migration (if it exists)
DROP TABLE IF EXISTS "_UserServiceToCustomFilterValue";

-- Create correctly named join table (Prisma convention: alphabetical)
CREATE TABLE IF NOT EXISTS "_CustomFilterValueToUserService" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "_CustomFilterValueToUserService_AB_unique" ON "_CustomFilterValueToUserService"("A", "B");
CREATE INDEX IF NOT EXISTS "_CustomFilterValueToUserService_B_index" ON "_CustomFilterValueToUserService"("B");

ALTER TABLE "_CustomFilterValueToUserService" DROP CONSTRAINT IF EXISTS "_CustomFilterValueToUserService_A_fkey";
ALTER TABLE "_CustomFilterValueToUserService" DROP CONSTRAINT IF EXISTS "_CustomFilterValueToUserService_B_fkey";

ALTER TABLE "_CustomFilterValueToUserService" ADD CONSTRAINT "_CustomFilterValueToUserService_A_fkey" FOREIGN KEY ("A") REFERENCES "CustomFilterValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_CustomFilterValueToUserService" ADD CONSTRAINT "_CustomFilterValueToUserService_B_fkey" FOREIGN KEY ("B") REFERENCES "UserService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
