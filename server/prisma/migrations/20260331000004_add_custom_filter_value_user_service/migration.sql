-- CreateTable: M2M between UserService and CustomFilterValue
CREATE TABLE "_UserServiceToCustomFilterValue" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_UserServiceToCustomFilterValue_AB_unique" ON "_UserServiceToCustomFilterValue"("A", "B");
CREATE INDEX "_UserServiceToCustomFilterValue_B_index" ON "_UserServiceToCustomFilterValue"("B");

-- AddForeignKey
ALTER TABLE "_UserServiceToCustomFilterValue" ADD CONSTRAINT "_UserServiceToCustomFilterValue_A_fkey" FOREIGN KEY ("A") REFERENCES "UserService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_UserServiceToCustomFilterValue" ADD CONSTRAINT "_UserServiceToCustomFilterValue_B_fkey" FOREIGN KEY ("B") REFERENCES "CustomFilterValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
