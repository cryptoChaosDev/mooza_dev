-- CreateTable: M2M between UserService and CustomFilterValue
CREATE TABLE "_CustomFilterValueToUserService" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_CustomFilterValueToUserService_AB_unique" ON "_CustomFilterValueToUserService"("A", "B");
CREATE INDEX "_CustomFilterValueToUserService_B_index" ON "_CustomFilterValueToUserService"("B");

-- AddForeignKey
ALTER TABLE "_CustomFilterValueToUserService" ADD CONSTRAINT "_CustomFilterValueToUserService_A_fkey" FOREIGN KEY ("A") REFERENCES "CustomFilterValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_CustomFilterValueToUserService" ADD CONSTRAINT "_CustomFilterValueToUserService_B_fkey" FOREIGN KEY ("B") REFERENCES "UserService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
