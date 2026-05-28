ALTER TABLE "Post" ADD COLUMN "artistId" TEXT;
ALTER TABLE "Post" ADD CONSTRAINT "Post_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Post_artistId_idx" ON "Post"("artistId");
