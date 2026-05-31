-- E10: MVP feed foundation — additive columns on "Post" (safe, no data loss)

ALTER TABLE "Post" ADD COLUMN "title" TEXT;
ALTER TABLE "Post" ADD COLUMN "category" TEXT;
ALTER TABLE "Post" ADD COLUMN "city" TEXT;
ALTER TABLE "Post" ADD COLUMN "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Post" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Post" ADD COLUMN "genres" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Post" ADD COLUMN "links" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Post" ADD COLUMN "mentions" JSONB;
ALTER TABLE "Post" ADD COLUMN "repostComment" TEXT;
ALTER TABLE "Post" ADD COLUMN "repostOfId" TEXT;

-- Self-relation for reposts
ALTER TABLE "Post" ADD CONSTRAINT "Post_repostOfId_fkey"
  FOREIGN KEY ("repostOfId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for feed filtering
CREATE INDEX "Post_repostOfId_idx" ON "Post"("repostOfId");
CREATE INDEX "Post_type_idx" ON "Post"("type");
CREATE INDEX "Post_city_idx" ON "Post"("city");
