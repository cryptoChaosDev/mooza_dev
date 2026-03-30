-- CreateTable: join table for Service <-> CustomFilter many-to-many
CREATE TABLE "_ServiceCustomFilters" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ServiceCustomFilters_A_fkey" FOREIGN KEY ("A") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ServiceCustomFilters_B_fkey" FOREIGN KEY ("B") REFERENCES "CustomFilter"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_ServiceCustomFilters_AB_unique" ON "_ServiceCustomFilters"("A", "B");
CREATE INDEX "_ServiceCustomFilters_B_index" ON "_ServiceCustomFilters"("B");
